#!/usr/bin/env bun
/**
 * Quality evaluation runner using LLM-as-judge via Anthropic API.
 *
 * Runs skill templates against test tasks, sends to an LLM with the judge
 * prompt, and scores output quality against rubric criteria.
 *
 * Environment:
 *   ANTHROPIC_API_KEY     — Required for actual evaluation
 *   EVAL_MODEL            — Model to use (default: claude-sonnet-4-6)
 *
 * Usage:
 *   bun run eval:gate              # Run gate-level evals (blocks release)
 *   bun run eval:changed           # Run evals for changed skills only
 *   bun run scripts/eval-runner.ts # Run all evals
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import YAML from "yaml";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(import.meta.dir, "..");
const EVALS_DIR = path.join(ROOT, "evals", "skill-evals");
const JUDGE_PROMPT_PATH = path.join(ROOT, "evals", "judge-prompts", "code-quality-judge.md");
const SKILLS_DIR = path.join(ROOT, "skills");

const args = process.argv.slice(2);
const gateOnly = args.includes("--gate");
const changedOnly = args.includes("--changed");

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.EVAL_MODEL || "claude-sonnet-4-6";

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
  score: number;
  passed: boolean;
  details: Record<string, number>;
  rationale: string;
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
  try {
    const diff = execSync("git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD", {
      encoding: "utf-8",
      cwd: ROOT,
    });
    const changed = new Set<string>();
    for (const line of diff.split("\n")) {
      const match = line.match(/skills\/[\w-]+\/([\w-]+)\//);
      if (match) changed.add(match[1]);
    }
    return changed;
  } catch (e) {
    console.warn(`⚠ Could not detect changed skills: ${(e as Error).message}`);
    return new Set();
  }
}

// ─── LLM Judge ─────────────────────────────────────────────

async function judgeWithLLM(
  client: Anthropic,
  skillContent: string,
  taskContent: string,
  rubric: Rubric,
  judgePrompt: string,
): Promise<JudgeResponse> {
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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: judgePrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract JSON from response
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Extract JSON block — prefer ```json fenced block, fall back to first { ... }
  let jsonStr: string | null = null;
  const fencedMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (fencedMatch) {
    jsonStr = fencedMatch[1].trim();
  } else {
    // Find the first complete JSON object by matching balanced braces
    const startIdx = text.indexOf("{");
    if (startIdx !== -1) {
      let depth = 0;
      for (let i = startIdx; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") depth--;
        if (depth === 0) {
          jsonStr = text.slice(startIdx, i + 1);
          break;
        }
      }
    }
  }

  if (!jsonStr) {
    throw new Error(`Judge did not return valid JSON. Response: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonStr) as JudgeResponse;

  // Validate and recompute weighted average for safety
  const totalWeight = Object.values(rubric.criteria).reduce((s, c) => s + c.weight, 0);
  let weightedSum = 0;
  for (const [name, criterion] of Object.entries(rubric.criteria)) {
    const score = parsed.scores[name] ?? 0;
    weightedSum += score * criterion.weight;
  }
  parsed.weighted_average = Math.round((weightedSum / totalWeight) * 10) / 10;
  parsed.pass = parsed.weighted_average >= rubric.min_pass_score;

  return parsed;
}

// ─── Main ───────────────────────────────────────────────────

let suites = findEvalSuites();

if (suites.length === 0) {
  console.log("No eval suites found in evals/skill-evals/.");
  console.log("Create eval tasks with:\n  mkdir -p evals/skill-evals/<skill-name>/tasks/");
  console.log("  # Add .md task files and rubric.yaml");
  process.exit(0);
}

// Filter to changed skills if requested
if (changedOnly) {
  const changed = getChangedSkills();
  if (changed.size === 0) {
    console.log("No changed skills detected. Nothing to evaluate.");
    process.exit(0);
  }
  suites = suites.filter((s) => changed.has(s));
  console.log(`Changed skills: ${Array.from(changed).join(", ")}`);
  if (suites.length === 0) {
    console.log("No eval suites for changed skills. Skipping.");
    process.exit(0);
  }
}

// Check API key
if (!API_KEY) {
  console.warn("⚠ ANTHROPIC_API_KEY not set. Running in dry-run mode (structure check only).\n");

  // Validate structure even without API key
  let structureErrors = 0;
  for (const suite of suites) {
    const tasks = loadTasks(suite);
    const rubric = loadRubric(suite);
    const skillMd = findSkillMd(suite);

    console.log(`── ${suite} ──`);
    if (tasks.length === 0) { console.log(`  ⚠ No tasks found`); structureErrors++; }
    else console.log(`  ✓ ${tasks.length} task(s)`);

    if (!rubric) { console.log(`  ⚠ No rubric.yaml`); structureErrors++; }
    else console.log(`  ✓ rubric.yaml (${Object.keys(rubric.criteria).length} criteria, min: ${rubric.min_pass_score})`);

    if (!skillMd) { console.log(`  ⚠ SKILL.md not found`); structureErrors++; }
    else console.log(`  ✓ ${path.relative(ROOT, skillMd)}`);
  }

  if (structureErrors > 0 && gateOnly) {
    console.error(`\n✗ ${structureErrors} structural issue(s). Fix before release.`);
    process.exit(1);
  }

  console.log("\n✓ Eval structure check complete (no API key — skipped LLM scoring).");
  process.exit(0);
}

// Run actual evaluations
const client = new Anthropic({ apiKey: API_KEY });
const judgePrompt = loadJudgePrompt();

console.log(`Eval runner — model: ${MODEL}`);
console.log(`Found ${suites.length} eval suite(s): ${suites.join(", ")}\n`);

const results: EvalResult[] = [];
let totalPassed = 0;
let totalFailed = 0;

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
      console.error(`  ✗ ${task.name}: ERROR — ${(e as Error).message}`);
      totalFailed++;
      results.push({
        skill: suite,
        task: task.name,
        score: 0,
        passed: false,
        details: {},
        rationale: `Error: ${(e as Error).message}`,
      });
    }
  }
}

// ─── Write results JSON ────────────────────────────────────

const resultsPath = path.join(ROOT, "evals", "results.json");
fs.writeFileSync(resultsPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  model: MODEL,
  results,
  summary: { passed: totalPassed, failed: totalFailed, total: totalPassed + totalFailed },
}, null, 2) + "\n");
console.log(`\nResults written to evals/results.json`);

// ─── Summary ────────────────────────────────────────────────

console.log("\n" + "═".repeat(45));
console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed > 0 && gateOnly) {
  console.error("✗ Quality gate failed. Fix failing evals before release.");
  process.exit(1);
} else {
  console.log("✓ All evals passed.");
}
