import { beforeEach, expect, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  judgeWithLLM, JudgeRefusalError, JudgeTruncationError, parseEvalEffort, usageTotals,
} from "../scripts/eval-runner";

const ROOT = path.resolve(import.meta.dir, "..");
const rubric = {
  criteria: { correctness: { weight: 2, description: "Correct answer" }, clarity: { weight: 1, description: "Clear answer" } },
  min_pass_score: 7,
};
const judgment = JSON.stringify({ scores: { correctness: 9, clarity: 6 }, weighted_average: 0, pass: false, rationale: "OK" });
const tokens = { input_tokens: 100, output_tokens: 25, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, iterations: null };
function response(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test", type: "message", role: "assistant", model: "claude-sonnet-5-5",
    content: [{ type: "text", text: judgment }], stop_reason: "end_turn", stop_details: null,
    stop_sequence: null, usage: tokens, ...overrides,
  };
}
function clientFor(body: ReturnType<typeof response>) {
  return new Anthropic({
    apiKey: "test-key", authToken: null, maxRetries: 0,
    fetch: async () => Response.json(body),
  });
}
const judge = (client: Anthropic) => judgeWithLLM(client, "skill", "task", rubric, "judge");

beforeEach(() => {
  usageTotals.input = usageTotals.output = usageTotals.calls = usageTotals.fallbackCalls = 0;
  usageTotals.servedModels = {};
  usageTotals.responses = [];
});

test("effort defaults high, accepts documented levels, rejects invalid input", () => {
  expect(parseEvalEffort()).toBe("high");
  for (const effort of ["low", "medium", "high", "xhigh", "max"]) expect(parseEvalEffort(effort)).toBe(effort);
  for (const effort of ["", "HIGH", "turbo", " high "]) expect(() => parseEvalEffort(effort)).toThrow("Invalid EVAL_EFFORT");
});

test("judge recomputes scores and records the actual served model", async () => {
  const result = await judge(clientFor(response()));
  expect(result.weighted_average).toBe(8);
  expect(result.pass).toBe(true);
  expect(result.usage.servedModel).toBe("claude-sonnet-5-5");
  expect(usageTotals).toMatchObject({ input: 100, output: 25, calls: 1, fallbackCalls: 0, servedModels: { "claude-sonnet-5-5": 1 } });
});

test("judge parses unfenced JSON with braces and escaped quotes inside rationale strings", async () => {
  for (const rationale of ['Use } to close the block.', 'The literal { opens a block.', 'Quoted "}" and a backslash \\ remain text.']) {
    const text = JSON.stringify({ scores: { correctness: 9, clarity: 6 }, weighted_average: 0, pass: false, rationale });
    const result = await judge(clientFor(response({ content: [{ type: "text", text: `Judgment follows:\n${text}\nEnd.` }] })));
    expect(result.rationale).toBe(rationale);
    expect(result.weighted_average).toBe(8);
    expect(result.pass).toBe(true);
  }
});

test("refusal is named before parsing even if its content is valid scoring JSON", async () => {
  await expect(judge(clientFor(response({
    stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "Declined" },
  })))).rejects.toBeInstanceOf(JudgeRefusalError);
  expect(usageTotals.calls).toBe(1);
  expect(usageTotals.responses[0].stopDetails?.category).toBe("cyber");
});

test("max_tokens is named before parsing even if content is valid JSON", async () => {
  await expect(judge(clientFor(response({ stop_reason: "max_tokens" })))).rejects.toBeInstanceOf(JudgeTruncationError);
  expect(usageTotals.output).toBe(25);
});

test("fallback hop and token iterations remain visible", async () => {
  const transition = {
    type: "fallback", from: { model: "claude-sonnet-5-5" }, to: { model: "claude-sonnet-5" },
    trigger: { type: "refusal", category: "cyber" },
  };
  const iterations = [{ ...tokens, type: "fallback_message", model: "claude-sonnet-5" }];
  const result = await judge(clientFor(response({
    model: "claude-sonnet-5", usage: { ...tokens, iterations },
    content: [transition, { type: "text", text: judgment }],
  })));
  expect(result.usage).toMatchObject({ servedModel: "claude-sonnet-5", fallback: true, transitions: [transition], tokens: { iterations } });
  expect(usageTotals.fallbackCalls).toBe(1);
  expect(usageTotals.servedModels).toEqual({ "claude-sonnet-5": 1 });
});

test("sticky fallback usage is detected without a transition block, including final refusal", async () => {
  const body = response({
    model: "claude-sonnet-5", stop_reason: "refusal", content: [],
    usage: { ...tokens, iterations: [{ ...tokens, type: "fallback_message", model: "claude-sonnet-5" }] },
  });
  await expect(judge(clientFor(body))).rejects.toBeInstanceOf(JudgeRefusalError);
  expect(usageTotals.responses[0].fallback).toBe(true);
  expect(usageTotals.responses[0].transitions).toEqual([]);
  expect(usageTotals.fallbackCalls).toBe(1);
});

test("CLI sends explicit effort, old override and fallback beta; errors have null scores and fail gate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-judge-"));
  const requests: Array<{ body: unknown; beta: string | null }> = [];
  let calls = 0;
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    async fetch(request) {
      requests.push({ body: await request.json(), beta: request.headers.get("anthropic-beta") });
      calls++;
      return Response.json(response(calls === 1 ? { stop_reason: "refusal" } : calls === 2 ? { stop_reason: "max_tokens" } : {}));
    },
  });
  try {
    const skill = path.join(root, "skills/coding/example");
    const suite = path.join(root, "evals/skill-evals/example");
    fs.mkdirSync(skill, { recursive: true });
    fs.mkdirSync(path.join(suite, "tasks"), { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example\n---\nExample skill");
    fs.writeFileSync(path.join(suite, "rubric.yaml"), "criteria:\n  correctness:\n    weight: 2\n    description: Correct answer\n  clarity:\n    weight: 1\n    description: Clear answer\nmin_pass_score: 7\n");
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(suite, "tasks", `task-${n}.md`), "Example task");
    const child = Bun.spawn([process.execPath, path.join(ROOT, "scripts/eval-runner.ts"), "--gate"], {
      env: {
        ...process.env, TROVE_EVAL_ROOT: root, ANTHROPIC_BASE_URL: server.url.toString(),
        ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "test-token", EVAL_MODEL: "claude-sonnet-5", EVAL_EFFORT: "medium",
      }, stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(1);
    expect(stderr).toContain("JudgeRefusalError");
    expect(stderr).toContain("JudgeTruncationError");
    expect(stdout).toContain("effort: medium");
    for (const request of requests) {
      expect(request.body).toMatchObject({ model: "claude-sonnet-5", output_config: { effort: "medium" }, thinking: { type: "adaptive" }, fallbacks: "default" });
      expect(request.beta).toContain("server-side-fallback-2026-07-01");
      expect(request.body).not.toHaveProperty("temperature");
    }
    const saved = JSON.parse(fs.readFileSync(path.join(root, "evals/results.json"), "utf-8"));
    expect(saved.results.map((result: { score: number | null }) => result.score)).toEqual([null, null, 8]);
    expect(saved.usage.calls).toBe(3);
    expect(saved.effort).toBe("medium");
  } finally {
    server.stop(true);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI fails once when the judge never responds", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-judge-"));
  let calls = 0;
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch() {
      calls++;
      return new Promise(() => {});
    },
  });
  try {
    const skill = path.join(root, "skills/coding/example");
    const suite = path.join(root, "evals/skill-evals/example");
    fs.mkdirSync(skill, { recursive: true });
    fs.mkdirSync(path.join(suite, "tasks"), { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example\n---\nExample skill");
    fs.writeFileSync(path.join(suite, "rubric.yaml"), "criteria:\n  correctness:\n    weight: 1\n    description: Correct answer\nmin_pass_score: 7\n");
    for (let n = 1; n <= 2; n++) fs.writeFileSync(path.join(suite, "tasks", `task-${n}.md`), "Example task");
    const child = Bun.spawn([process.execPath, path.join(ROOT, "scripts/eval-runner.ts"), "--gate"], {
      env: {
        ...process.env, TROVE_EVAL_ROOT: root, ANTHROPIC_BASE_URL: server.url.toString(),
        ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "test-token", EVAL_REQUEST_TIMEOUT_MS: "500",
      }, stdout: "pipe", stderr: "pipe",
    });
    const [stderr, exit] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(1);
    expect(stderr).toContain("JudgeTimeoutError");
    // One call and no retry. The run stops before the second task.
    expect(calls).toBe(1);
    expect(stderr.match(/JudgeTimeoutError/g)).toHaveLength(1);
  } finally {
    server.stop(true);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI stops when the judge is rate limited instead of waiting out the reset", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-judge-"));
  let calls = 0;
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch() {
      calls++;
      return new Response(JSON.stringify({ error: { message: "limited", type: "rate_limit_error" } }), {
        status: 429, headers: { "content-type": "application/json", "retry-after": "3600" },
      });
    },
  });
  try {
    const skill = path.join(root, "skills/coding/example");
    const suite = path.join(root, "evals/skill-evals/example");
    fs.mkdirSync(skill, { recursive: true });
    fs.mkdirSync(path.join(suite, "tasks"), { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example\n---\nExample skill");
    fs.writeFileSync(path.join(suite, "rubric.yaml"), "criteria:\n  correctness:\n    weight: 1\n    description: Correct answer\nmin_pass_score: 7\n");
    fs.writeFileSync(path.join(suite, "tasks", "task-1.md"), "Example task");
    const child = Bun.spawn([process.execPath, path.join(ROOT, "scripts/eval-runner.ts"), "--gate"], {
      env: {
        ...process.env, TROVE_EVAL_ROOT: root, ANTHROPIC_BASE_URL: server.url.toString(),
        ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "test-token",
      }, stdout: "pipe", stderr: "pipe",
    });
    const [stderr, exit] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(1);
    expect(stderr).toContain("JudgeRateLimitError");
    expect(stderr).toContain("3600");
    expect(calls).toBe(1);
  } finally {
    server.stop(true);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI keeps the scores it already has when the judge is rate limited mid-run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-judge-"));
  let calls = 0;
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch() {
      calls++;
      if (calls === 1) return Response.json(response());
      return new Response(JSON.stringify({ error: { message: "limited", type: "rate_limit_error" } }), {
        status: 429, headers: { "content-type": "application/json", "retry-after": "3600" },
      });
    },
  });
  try {
    const skill = path.join(root, "skills/coding/example");
    const suite = path.join(root, "evals/skill-evals/example");
    fs.mkdirSync(skill, { recursive: true });
    fs.mkdirSync(path.join(suite, "tasks"), { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example\n---\nExample skill");
    fs.writeFileSync(path.join(suite, "rubric.yaml"), "criteria:\n  correctness:\n    weight: 2\n    description: Correct answer\n  clarity:\n    weight: 1\n    description: Clear answer\nmin_pass_score: 7\n");
    for (let n = 1; n <= 3; n++) fs.writeFileSync(path.join(suite, "tasks", `task-${n}.md`), "Example task");
    const child = Bun.spawn([process.execPath, path.join(ROOT, "scripts/eval-runner.ts"), "--gate"], {
      env: {
        ...process.env, TROVE_EVAL_ROOT: root, ANTHROPIC_BASE_URL: server.url.toString(),
        ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "test-token",
      }, stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(1);
    expect(stderr).toContain("JudgeRateLimitError");
    expect(calls).toBe(2);
    // An interrupted run never reports a pass.
    expect(stdout).not.toContain("All evals passed");
    const saved = JSON.parse(fs.readFileSync(path.join(root, "evals/results.json"), "utf-8"));
    expect(saved.aborted).toMatchObject({ error: "JudgeRateLimitError", skill: "example", task: "task-2" });
    expect(saved.results.map((result: { task: string; score: number | null }) => [result.task, result.score])).toEqual([["task-1", 8]]);
    expect(saved.summary).toEqual({ passed: 1, failed: 0, total: 1 });
    expect(saved.usage.calls).toBe(1);
  } finally {
    server.stop(true);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI skips skills named in EVAL_SKIP_SKILLS and rejects one with no suite", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-judge-"));
  let calls = 0;
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch() { calls++; return Response.json(response()); },
  });
  const writeSuite = (name: string) => {
    const skill = path.join(root, "skills/coding", name);
    const suite = path.join(root, "evals/skill-evals", name);
    fs.mkdirSync(skill, { recursive: true });
    fs.mkdirSync(path.join(suite, "tasks"), { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), `---\nname: ${name}\ndescription: Example\n---\nExample skill`);
    fs.writeFileSync(path.join(suite, "rubric.yaml"), "criteria:\n  correctness:\n    weight: 1\n    description: Correct answer\nmin_pass_score: 7\n");
    fs.writeFileSync(path.join(suite, "tasks", "task-1.md"), "Example task");
  };
  try {
    writeSuite("alpha");
    writeSuite("beta");
    const env = {
      ...process.env, TROVE_EVAL_ROOT: root, ANTHROPIC_BASE_URL: server.url.toString(),
      ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "test-token", EVAL_SKIP_SKILLS: "alpha",
    };
    const child = Bun.spawn([process.execPath, path.join(ROOT, "scripts/eval-runner.ts"), "--gate"], {
      env, stdout: "pipe", stderr: "pipe",
    });
    const [stdout, exit] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    expect(exit).toBe(1);
    expect(stdout).toContain("Skipping 1 suite(s)");
    expect(stdout).not.toContain("All evals passed");
    expect(calls).toBe(1);
    const saved = JSON.parse(fs.readFileSync(path.join(root, "evals/results.json"), "utf-8"));
    expect(saved.results.map((result: { skill: string }) => result.skill)).toEqual(["beta"]);
    expect(saved.skippedSkills).toEqual(["alpha"]);

    const bad = Bun.spawn([process.execPath, path.join(ROOT, "scripts/eval-runner.ts"), "--gate"], {
      env: { ...env, EVAL_SKIP_SKILLS: "no-such-skill" }, stdout: "pipe", stderr: "pipe",
    });
    const [stderr, badExit] = await Promise.all([new Response(bad.stderr).text(), bad.exited]);
    expect(badExit).toBe(1);
    expect(stderr).toContain("no-such-skill");
    // The rejected name never reached the judge.
    expect(calls).toBe(1);
  } finally {
    server.stop(true);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
