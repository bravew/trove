#!/usr/bin/env bun
/**
 * Quality evaluation runner using LLM-as-judge via Anthropic API.
 *
 * Runs skill templates against test tasks, sends to an LLM with the judge
 * prompt, and scores output quality against rubric criteria.
 *
 * Environment:
 *   ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN — Credentials for actual evaluation
 *   EVAL_MODEL            — Model to use (default: claude-sonnet-5-5)
 *   EVAL_EFFORT           — low | medium | high | xhigh | max (default: high)
 *   EVAL_MAX_TOKENS       — Judge response cap (default: 8192)
 *   EVAL_REQUEST_TIMEOUT_MS — Per-request cap (default: 60000)
 *
 * Usage:
 *   bun run eval:gate              # Run gate-level evals (blocks release)
 *   bun run eval:changed           # Run evals for changed skills only
 *   bun run scripts/eval-runner.ts # Run all evals
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import Anthropic, { APIConnectionTimeoutError, RateLimitError } from "@anthropic-ai/sdk";
import {
  changedFilesFromMergeBase,
  maintainedSkills,
  skillsAffectedByFiles,
  validateEvalStructure,
} from "./lib/eval-structure";

const ROOT = process.env.TROVE_EVAL_ROOT ?? path.resolve(import.meta.dir, "..");
const EVALS_DIR = path.join(ROOT, "evals", "skill-evals");
const JUDGE_PROMPT_PATH = path.join(ROOT, "evals", "judge-prompts", "code-quality-judge.md");
const SKILLS_DIR = path.join(ROOT, "skills");

const args = process.argv.slice(2);
const gateOnly = args.includes("--gate");
const changedOnly = args.includes("--changed");
const structureOnly = args.includes("--structure");
const option = (name: string): string | undefined => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || "claude-sonnet-5-5";

export function parseEvalEffort(value = "high"): NonNullable<Anthropic.Beta.BetaOutputConfig["effort"]> {
  switch (value) {
    case "low": case "medium": case "high": case "xhigh": case "max":
      return value;
    default:
      throw new Error(`Invalid EVAL_EFFORT: ${value}. Expected low, medium, high, xhigh, or max.`);
  }
}

const EFFORT = parseEvalEffort(process.env.EVAL_EFFORT);

/**
 * Judge response cap.
 *
 * On Sonnet 5.5 adaptive thinking is on and `max_tokens` bounds thinking **plus**
 * visible output, so the previous 1024 could be spent entirely on reasoning and
 * truncate the judge's JSON — which reads as a quality regression rather than a
 * truncation. The judge's JSON is a few hundred tokens; the headroom is for the
 * thinking in front of it.
 */
const MAX_TOKENS = Number(process.env.EVAL_MAX_TOKENS ?? 8192);

/**
 * Per-request cap. The SDK's own default is ten minutes, and a dead sign-in
 * never returns at all, so one unreachable judge stalls the whole run until
 * something outside kills it. A minute is far longer than a healthy response.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.EVAL_REQUEST_TIMEOUT_MS ?? 60_000);

/** Token usage accumulated across judge calls, for cost comparison. */
export const usageTotals = {
  input: 0, output: 0, calls: 0, fallbackCalls: 0,
  servedModels: {} as Record<string, number>,
  responses: [] as JudgeUsage[],
};

interface JudgeUsage {
  id: string;
  requestedModel: string;
  servedModel: string;
  fallback: boolean;
  transitions: Anthropic.Beta.BetaFallbackBlock[];
  stopReason: Anthropic.Beta.BetaMessage["stop_reason"];
  stopDetails: Anthropic.Beta.BetaMessage["stop_details"];
  // Preserve iterations/cache tokens for fallback-aware cost accounting.
  tokens: Anthropic.Beta.BetaMessage["usage"];
}

export class JudgeRefusalError extends Error {
  override name = "JudgeRefusalError";
}

export class JudgeTruncationError extends Error {
  override name = "JudgeTruncationError";
}

export class JudgeTimeoutError extends Error {
  override name = "JudgeTimeoutError";
}

export class JudgeRateLimitError extends Error {
  override name = "JudgeRateLimitError";
}

// ─── Types ─────────────────────────────────────────────────

interface EvalTask {
  name: string;
  content: string;
}

interface RubricCriterion {
  weight: number;
  description: string;
}

interface Rubric {
  criteria: Record<string, RubricCriterion>;
  min_pass_score: number;
}

interface JudgeResponse {
  scores: Record<string, number>;
  weighted_average: number;
  pass: boolean;
  rationale: string;
}

interface EvalResult {
  skill: string;
  task: string;
  score: number | null;
  passed: boolean;
  details: Record<string, number>;
  rationale: string;
  error?: string;
  usage?: JudgeUsage;
}

// ─── Eval discovery ─────────────────────────────────────────

function findEvalSuites(): string[] {
  if (!fs.existsSync(EVALS_DIR)) return [];
  return fs.readdirSync(EVALS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadTasks(skillName: string): EvalTask[] {
  const tasksDir = path.join(EVALS_DIR, skillName, "tasks");
  if (!fs.existsSync(tasksDir)) return [];

  return fs.readdirSync(tasksDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => ({
      name: f.replace(/\.md$/, ""),
      content: fs.readFileSync(path.join(tasksDir, f), "utf-8"),
    }));
}

function loadRubric(skillName: string): Rubric | null {
  const rubricPath = path.join(EVALS_DIR, skillName, "rubric.yaml");
  if (!fs.existsSync(rubricPath)) return null;
  return YAML.parse(fs.readFileSync(rubricPath, "utf-8")) as Rubric;
}

function loadJudgePrompt(): string {
  if (!fs.existsSync(JUDGE_PROMPT_PATH)) {
    return "You are a code quality judge. Score from 0-10 per criterion. Return JSON.";
  }
  return fs.readFileSync(JUDGE_PROMPT_PATH, "utf-8");
}

// ─── Skill file discovery ──────────────────────────────────

function findSkillMd(skillName: string): string | null {
  // Search recursively under skills/ for the matching skill directory
  function walk(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === skillName) {
        const mdPath = path.join(full, "SKILL.md");
        if (fs.existsSync(mdPath)) return mdPath;
        const tmplPath = path.join(full, "SKILL.md.tmpl");
        if (fs.existsSync(tmplPath)) return tmplPath;
      }
      const nested = walk(full);
      if (nested) return nested;
    }
    return null;
  }

  return walk(SKILLS_DIR);
}

// ─── Changed skills detection ──────────────────────────────

function getChangedSkills(): Set<string> {
  const base = option("base") ?? process.env.EVAL_BASE_REF ?? "origin/main";
  const head = option("head") ?? process.env.EVAL_HEAD_REF ?? "HEAD";
  const files = changedFilesFromMergeBase(ROOT, base, head);
  return new Set(skillsAffectedByFiles(ROOT, files));
}

// ─── LLM Judge ─────────────────────────────────────────────

/** The balanced `{ ... }` starting at `start`, matching structural braces only:
 * rationale strings can contain braces, escaped quotes, and backslashes. */
function balancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** The judge's scoring object. Prose before it may quote code with braces,
 * such as `{bgm: false}`, so the first `{` is not necessarily the judgment.
 * Fenced ```json blocks are tried first, then every balanced object in order,
 * and the first one that parses with a `scores` object wins. */
function extractJudgment(text: string): JudgeResponse {
  const candidates: string[] = [];
  for (const match of text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)) candidates.push(match[1].trim());
  for (let i = text.indexOf("{"); i !== -1; i = text.indexOf("{", i + 1)) {
    const object = balancedObject(text, i);
    if (object) candidates.push(object);
  }
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as JudgeResponse;
      if (value && typeof value.scores === "object" && value.scores !== null) return value;
    } catch {
      // Not the judgment; try the next candidate.
    }
  }
  throw new Error(`Judge returned no scoring JSON. Response sample: ${text.slice(0, 300)}`);
}

export async function judgeWithLLM(
  client: Anthropic,
  skillContent: string,
  taskContent: string,
  rubric: Rubric,
  judgePrompt: string,
): Promise<JudgeResponse & { usage: JudgeUsage }> {
  const rubricText = Object.entries(rubric.criteria)
    .map(([name, c]) => `- **${name}** (weight: ${c.weight}): ${c.description}`)
    .join("\n");

  const userMessage = `## SKILL.md (provided to the AI)

${skillContent}

## Task (given to the AI)

${taskContent}

## Rubric Criteria

${rubricText}

Minimum pass score: ${rubric.min_pass_score}

## Instructions

Imagine an AI coding assistant received the SKILL.md above as context, then was asked to complete the task.
Generate what a reasonable AI response would be, then evaluate that response against the rubric criteria.

Score each criterion 0-10 and compute a weighted average. Return JSON only:
\`\`\`json
{
  "scores": { "<criterion>": <0-10>, ... },
  "weighted_average": <number>,
  "pass": <boolean>,
  "rationale": "<brief explanation>"
}
\`\`\``;

  // No temperature/top_p/top_k anywhere in this repo, and none added here:
  // Sonnet 5.5 rejects non-default sampling parameters with a 400.
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: judgePrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  usageTotals.input += response.usage.input_tokens;
  usageTotals.output += response.usage.output_tokens;
  usageTotals.calls += 1;
  const transitions = response.content.filter((block) => block.type === "fallback");
  const fallback = transitions.length > 0 ||
    (response.usage.iterations ?? []).some((entry) => entry.type === "fallback_message");
  const usage: JudgeUsage = {
    id: response.id, requestedModel: MODEL, servedModel: response.model,
    fallback, transitions, stopReason: response.stop_reason,
    stopDetails: response.stop_details, tokens: response.usage,
  };
  usageTotals.responses.push(usage);
  usageTotals.servedModels[response.model] = (usageTotals.servedModels[response.model] ?? 0) + 1;
  if (fallback) usageTotals.fallbackCalls += 1;

  // A refusal is an unavailable judgment, never a quality score.
  if (response.stop_reason === "refusal") {
    throw new JudgeRefusalError(
      `Judge refused after fallback handling (served model: ${response.model}, ` +
      `category: ${response.stop_details?.category ?? "unknown"}). Do not read this as a score change.`,
    );
  }

  // A truncated judge response yields unparseable JSON that looks like a bad
  // score. Name the real cause instead.
  if (response.stop_reason === "max_tokens") {
    throw new JudgeTruncationError(
      `Judge response hit max_tokens (${MAX_TOKENS}) before finishing its JSON. ` +
        `Raise EVAL_MAX_TOKENS; do not read the run as a score change.`,
    );
  }

  // Extract JSON from response
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = extractJudgment(text);

  // Validate and recompute weighted average for safety
  const totalWeight = Object.values(rubric.criteria).reduce((s, c) => s + c.weight, 0);
  let weightedSum = 0;
  for (const [name, criterion] of Object.entries(rubric.criteria)) {
    const score = parsed.scores[name] ?? 0;
    weightedSum += score * criterion.weight;
  }
  parsed.weighted_average = Math.round((weightedSum / totalWeight) * 10) / 10;
  parsed.pass = parsed.weighted_average >= rubric.min_pass_score;

  return { ...parsed, usage };
}

// ─── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  let suites = findEvalSuites();

  // Filter to changed skills if requested
  let requiredSkills = maintainedSkills(ROOT);
  if (changedOnly) {
    const changed = getChangedSkills();
    if (changed.size === 0) {
      console.log("No changed skills detected. Nothing to evaluate.");
      process.exit(0);
    }
    requiredSkills = [...changed].sort();
    suites = suites.filter((s) => changed.has(s));
    console.log(`Changed skills: ${Array.from(changed).join(", ")}`);
  }

  const structure = validateEvalStructure(ROOT, requiredSkills);
  if (structure.errors.length > 0) {
    for (const error of structure.errors) console.error(`✗ ${error}`);
    process.exit(1);
  }
  console.log(`✓ Eval structure valid for ${structure.skills.length} required skill(s).`);
  if (structureOnly) process.exit(0);

  // Keep credential-free CI structural; let the SDK resolve a key or bearer token.
  if (!API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log("MODEL_RESULT=skipped reason=missing_api_key");
    process.exit(0);
  }

  // Run actual evaluations
  // No SDK retries. It retries a rate limit for as long as the server asks,
  // with no ceiling, so a limit that resets in a few hours sleeps the run for
  // that long once per retry. Failing on the first response costs the short
  // automatic retry on a brief server error, and a rerun is the remedy.
  const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  const judgePrompt = loadJudgePrompt();

  console.log(`Eval runner — model: ${MODEL}, effort: ${EFFORT}, refusal fallback: default`);
  console.log(`Found ${suites.length} eval suite(s): ${suites.join(", ")}\n`);

  const results: EvalResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;

  // Select the unjudged tail of an interrupted run. Structure was checked for
  // every required skill above. Skipping a suite provides no evidence that it
  // passed, so this partial run cannot satisfy the full quality gate.
  const skip = new Set((process.env.EVAL_SKIP_SKILLS ?? "").split(",").map((name) => name.trim()).filter(Boolean));
  if (skip.size > 0) {
    const unknown = [...skip].filter((name) => !suites.includes(name));
    if (unknown.length > 0) {
      console.error(`EVAL_SKIP_SKILLS names skills with no suite: ${unknown.join(", ")}`);
      process.exit(1);
    }
    suites = suites.filter((name) => !skip.has(name));
    console.log(`Skipping ${skip.size} suite(s); results cover only the selected tasks.`);
  }

  const resultsPath = process.env.EVAL_RESULTS_PATH ?? path.join(ROOT, "evals", "results.json");
  const writeResults = (aborted?: { error: string; message: string; skill: string; task: string }): void => {
    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      model: MODEL,
      effort: EFFORT,
      fallbacks: "default",
      maxTokens: MAX_TOKENS,
      // Present only when the run stopped early. The results below are then a
      // prefix of the suite list, not a gate outcome.
      ...(aborted ? { aborted } : {}),
      ...(skip.size > 0 ? { skippedSkills: [...skip].sort() } : {}),
      // Recorded so a model change can be read as score-vs-cost rather than score
      // alone: tokenizers differ between models, so token counts move for reasons
      // unrelated to quality.
      usage: { ...usageTotals },
      results,
      summary: { passed: totalPassed, failed: totalFailed, total: totalPassed + totalFailed },
    }, null, 2) + "\n");
  };
  // A rate limit or a dead endpoint ends the run, and a long run can be most of
  // the way through by then. Keep the scores already paid for, marked as partial.
  const abort = (error: Error, skill: string, task: string): never => {
    writeResults({ error: error.name, message: error.message, skill, task });
    console.error(`Partial results (${results.length} task(s)) written to ${path.relative(ROOT, resultsPath)}`);
    throw error;
  };

  for (const suite of suites) {
    const tasks = loadTasks(suite);
    const rubric = loadRubric(suite);
    const skillMdPath = findSkillMd(suite);

    if (tasks.length === 0) {
      console.log(`  ⚠ ${suite}: no tasks found, skipping`);
      continue;
    }

    if (!rubric) {
      console.log(`  ⚠ ${suite}: no rubric.yaml found, skipping`);
      continue;
    }

    if (!skillMdPath) {
      console.log(`  ⚠ ${suite}: SKILL.md not found, skipping`);
      continue;
    }

    const skillContent = fs.readFileSync(skillMdPath, "utf-8");
    console.log(`── ${suite} (${tasks.length} task(s), min: ${rubric.min_pass_score}) ──`);

    for (const task of tasks) {
      try {
        const judge = await judgeWithLLM(client, skillContent, task.content, rubric, judgePrompt);

        results.push({
          skill: suite,
          task: task.name,
          score: judge.weighted_average,
          passed: judge.pass,
          details: judge.scores,
          rationale: judge.rationale,
          usage: judge.usage,
        });

        const icon = judge.pass ? "✓" : "✗";
        console.log(`  ${icon} ${task.name}: ${judge.weighted_average.toFixed(1)} / 10`);

        // Show per-criterion scores
        for (const [criterion, score] of Object.entries(judge.scores)) {
          console.log(`      ${criterion}: ${score}/10`);
        }

        if (judge.rationale) {
          console.log(`      rationale: ${judge.rationale}`);
        }

        if (judge.pass) totalPassed++;
        else totalFailed++;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        // A request that never completes will not complete for the next task
        // either. Fail the run once, with the cause named, instead of waiting
        // out the timeout for every task and calling each one a failed score.
        if (error instanceof RateLimitError) {
          const retryAfter = error.headers?.get("retry-after");
          const wait = retryAfter ? ` The server asked for a wait of ${retryAfter}.` : "";
          abort(new JudgeRateLimitError(
            `Judge was rate limited.${wait} A limit this long will not clear inside the run, so it stops instead of sleeping.`,
          ), suite, task.name);
        }
        if (error instanceof APIConnectionTimeoutError) {
          abort(new JudgeTimeoutError(
            `Judge did not respond within ${REQUEST_TIMEOUT_MS}ms. ` +
              `The sign-in or the endpoint is unreachable. Raise EVAL_REQUEST_TIMEOUT_MS if a response is genuinely that slow.`,
          ), suite, task.name);
        }
        console.error(`  ✗ ${task.name}: ${error.name} — ${error.message}`);
        totalFailed++;
        results.push({
          skill: suite,
          task: task.name,
          score: null,
          passed: false,
          details: {},
          error: error.name,
          rationale: `Error: ${error.message}`,
        });
      }
    }
  }

  // ─── Write results JSON ────────────────────────────────────

  writeResults();
  console.log(`\nResults written to ${path.relative(ROOT, resultsPath)}`);

  // ─── Summary ────────────────────────────────────────────────

  console.log("\n" + "═".repeat(45));
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(
    `Model:   ${MODEL} — ${usageTotals.calls} judge call(s), ` +
      `${usageTotals.input} in / ${usageTotals.output} out tokens; effort: ${EFFORT}`,
  );

  console.log(`Served models: ${JSON.stringify(usageTotals.servedModels)}; fallback calls: ${usageTotals.fallbackCalls}`);

  if (totalFailed > 0 && gateOnly) {
    console.error("✗ Quality gate failed. Fix failing evals before release.");
    process.exit(1);
  } else if (skip.size > 0) {
    console.log("Partial evaluation finished; skipped suites have not been verified by this run.");
    if (gateOnly) {
      console.error("✗ Quality gate incomplete. Partial results do not establish a full pass.");
      process.exit(1);
    }
  } else if (totalFailed > 0) {
    console.log("Evaluation finished with failures.");
  } else {
    console.log("✓ All evals passed.");
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  }
}
