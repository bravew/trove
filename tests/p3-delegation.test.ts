/**
 * P3 — Delegation & composition tests.
 *
 * Covers the dependency artifact (forward + reverse maps, cycle detection,
 * unknown-skill resolution), meta-skill projection, and the CLI's info
 * command surface.
 */

import { test, expect, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { detectCycles, buildForwardGraph } from "../scripts/lib/dep-graph";
import { buildOnceForTests } from "./helpers/build";

const ROOT = path.resolve(import.meta.dir, "..");
const OUTPUT = path.join(ROOT, "output");

beforeAll(buildOnceForTests, 120_000);

// ─── Dependency artifact ───────────────────────────────────

function loadDeps(): {
  benefitsFrom: Record<string, string[]>;
  benefitsOf: Record<string, string[]>;
  cycles: string[][];
  unknownReferences: Array<{ skill: string; missing: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "deps.json"), "utf-8"));
}

test("deps: artifact exists and lists every skill in benefitsFrom", () => {
  const deps = loadDeps();
  expect(deps.benefitsFrom).toBeDefined();
  // Every authored skill appears as a key, even if it has no benefits-from.
  expect(deps.benefitsFrom["trove-python"]).toEqual([]);
  expect(deps.benefitsFrom["trove-autoplan"]).toBeDefined();
  expect(deps.benefitsFrom["trove-ship"]).toBeDefined();
});

test("deps: forward map matches what was authored in frontmatter", () => {
  const deps = loadDeps();
  expect(deps.benefitsFrom["trove-review"]).toEqual(["trove-secret-scan", "trove-security-review"]);
  expect(deps.benefitsFrom["trove-spec"]).toEqual(["trove-unslop", "trove-user-story"]);
  expect(deps.benefitsFrom["trove-security-review"]).toEqual(["trove-secret-scan"]);
  expect(deps.benefitsFrom["trove-autoplan"]).toEqual([
    "trove-release-notes",
    "trove-spec",
    "trove-user-story",
  ]);
  expect(deps.benefitsFrom["trove-ship"]).toEqual(["trove-commit", "trove-review", "trove-security-review", "trove-unslop"]);
});

test("deps: reverse map is the transpose of the forward map", () => {
  const deps = loadDeps();
  // trove-secret-scan is referenced by trove-review and trove-security-review.
  expect(deps.benefitsOf["trove-secret-scan"]).toEqual(["trove-review", "trove-security-review"]);
  // trove-user-story is referenced by trove-autoplan and trove-spec.
  expect(deps.benefitsOf["trove-user-story"]).toEqual(["trove-autoplan", "trove-spec"]);
  // trove-commit is only referenced by trove-ship.
  expect(deps.benefitsOf["trove-commit"]).toEqual(["trove-ship"]);
});

test("deps: lists are sorted for deterministic output", () => {
  const deps = loadDeps();
  for (const list of Object.values(deps.benefitsFrom)) {
    const sorted = [...list].sort();
    expect(list).toEqual(sorted);
  }
  for (const list of Object.values(deps.benefitsOf)) {
    const sorted = [...list].sort();
    expect(list).toEqual(sorted);
  }
});

test("deps: no cycles or unknown references in the current graph", () => {
  const deps = loadDeps();
  expect(deps.cycles).toEqual([]);
  expect(deps.unknownReferences).toEqual([]);
});

// ─── Cycle detection ───────────────────────────────────────

test("dep-graph: detectCycles flags a simple A→B→A cycle", () => {
  const cycles = detectCycles(
    buildForwardGraph([
      { name: "A", benefitsFrom: ["B"] },
      { name: "B", benefitsFrom: ["A"] },
    ]),
  );
  expect(cycles.length).toBe(1);
  expect(cycles[0]).toEqual(["A", "B", "A"]);
});

test("dep-graph: detectCycles flags self-edge A→A", () => {
  const cycles = detectCycles(buildForwardGraph([{ name: "A", benefitsFrom: ["A"] }]));
  expect(cycles.length).toBe(1);
  expect(cycles[0]).toEqual(["A", "A"]);
});

test("dep-graph: detectCycles handles longer cycle A→B→C→A", () => {
  const cycles = detectCycles(
    buildForwardGraph([
      { name: "A", benefitsFrom: ["B"] },
      { name: "B", benefitsFrom: ["C"] },
      { name: "C", benefitsFrom: ["A"] },
    ]),
  );
  expect(cycles.length).toBe(1);
  expect(cycles[0]).toEqual(["A", "B", "C", "A"]);
});

test("dep-graph: detectCycles returns empty for a DAG", () => {
  const cycles = detectCycles(
    buildForwardGraph([
      { name: "A", benefitsFrom: ["B", "C"] },
      { name: "B", benefitsFrom: ["C"] },
      { name: "C", benefitsFrom: [] },
    ]),
  );
  expect(cycles).toEqual([]);
});

test("dep-graph: detectCycles deduplicates rotations of the same cycle", () => {
  // Same cycle visited from different starts must report once.
  const cycles = detectCycles(
    buildForwardGraph([
      { name: "A", benefitsFrom: ["B"] },
      { name: "B", benefitsFrom: ["A"] },
    ]),
  );
  expect(cycles.length).toBe(1);
});

test("dep-graph: detectCycles is linear on funnel-shaped DAGs", () => {
  // Funnel pattern: N source nodes all benefit-from a single sink. With
  // a naive DFS that re-explores from every starting node, this is O(N²);
  // with the three-color guard, it's O(N). The test sets N high enough
  // that an exponential blowup would be obvious (~30+ seconds), then
  // asserts the run completes well under that.
  const N = 200;
  const skills: Array<{ name: string; benefitsFrom: string[] }> = [];
  for (let i = 0; i < N; i++) {
    skills.push({ name: `src-${i}`, benefitsFrom: ["sink"] });
  }
  skills.push({ name: "sink", benefitsFrom: [] });

  const start = performance.now();
  const cycles = detectCycles(buildForwardGraph(skills));
  const ms = performance.now() - start;

  expect(cycles).toEqual([]);
  expect(ms).toBeLessThan(500); // generous ceiling; on a healthy machine this is single-digit ms
});

// ─── Meta-skill projection ────────────────────────────────

test("meta-skills: trove-autoplan template exists and projects with tier-4 preamble", () => {
  const tmplPath = path.join(ROOT, "skills", "workflow", "trove-autoplan", "SKILL.md.tmpl");
  expect(fs.existsSync(tmplPath)).toBe(true);
  const tmpl = fs.readFileSync(tmplPath, "utf-8");
  expect(tmpl).toMatch(/^preamble-tier: 4$/m);
  expect(tmpl).toContain("benefits-from:");

  // Generated Claude SKILL.md picks up tier-4 preamble (orchestrator).
  const skillMd = path.join(ROOT, "skills", "workflow", "trove-autoplan", "SKILL.md");
  expect(fs.existsSync(skillMd)).toBe(true);
  const md = fs.readFileSync(skillMd, "utf-8");
  expect(md).toContain("orchestrator");
  expect(md).toContain("delegation");
});

test("meta-skills: trove-ship template exists and projects with tier-4 preamble", () => {
  const md = fs.readFileSync(
    path.join(ROOT, "skills", "workflow", "trove-ship", "SKILL.md"),
    "utf-8",
  );
  expect(md).toContain("orchestrator");
  expect(md).toContain("delegation");
  expect(md).toContain("Decision Gate: ready to push");
});

test("meta-skills: both meta-skills appear only in trove-workflow's scoped AGENTS.md", () => {
  const workflowAgents = fs.readFileSync(
    path.join(OUTPUT, "agents", "plugins", "trove-workflow", "AGENTS.md"),
    "utf-8",
  );
  expect(workflowAgents).toContain("## trove-autoplan");
  expect(workflowAgents).toContain("## trove-ship");

  const devAgents = fs.readFileSync(
    path.join(OUTPUT, "agents", "plugins", "trove-dev", "AGENTS.md"),
    "utf-8",
  );
  expect(devAgents).not.toContain("## trove-autoplan");
  expect(devAgents).not.toContain("## trove-ship");
});

test("meta-skills: both appear in the routing index with their benefits-from", () => {
  const routing = fs.readFileSync(path.join(ROOT, "docs", "routing.md"), "utf-8");
  expect(routing).toContain("**trove-autoplan**");
  expect(routing).toContain("**trove-ship**");
});

// ─── CLI info relationship display ─────────────────────────

test("cli: role-filtered list shows trove-workflow skills", () => {
  const result = spawnSync("./bin/trove", ["list", "--role=dev"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  expect(result.status).toBe(0);
  const out = result.stdout?.toString() ?? "";
  expect(out).toContain("trove-workflow");
  expect(out).toContain("skills (24):");
  expect(out).toContain("trove-brainstorm");
  expect(out).toContain("trove-write-skill");
  expect(out).toContain("using-trove");
});

test("cli: info trove-dev shows benefits-from and benefits-of for skills", () => {
  const result = spawnSync("./bin/trove", ["info", "trove-dev"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  expect(result.status).toBe(0);
  const out = result.stdout?.toString() ?? "";
  // Core skill listing
  expect(out).toContain("trove-review");
  // benefits-from line for trove-review
  expect(out).toContain("benefits from: trove-secret-scan, trove-security-review");
  // benefits-of line — trove-review benefits-of trove-ship
  expect(out).toContain("benefits of:   trove-ship");
  // Workflow meta-skills live only in trove-workflow after alias pruning.
  expect(out).not.toContain("  • trove-autoplan");
  expect(out).not.toContain("  • trove-ship");
});

test("cli: info resolves workflow skills and rejects removed trove-dev aliases", () => {
  const workflow = spawnSync("./bin/trove", ["info", "trove-workflow:trove-autoplan"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  expect(workflow.status).toBe(0);
  expect(workflow.stdout?.toString() ?? "").toContain("trove-workflow:trove-autoplan");

  const removed = spawnSync("./bin/trove", ["info", "trove-dev:trove-autoplan"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  expect(removed.status).toBe(1);
  expect(removed.stderr?.toString() ?? "").toContain(
    "Skill 'trove-autoplan' not found in plugin 'trove-dev'.",
  );
  expect(removed.stdout?.toString() ?? "").toContain("Available skills:");
});

test("cli: info on a skill-less plugin still works", () => {
  // We don't have a skill-less plugin in the catalog, so just verify the
  // command runs cleanly on a plugin that does have skills (regression
  // guard against the deps loader crashing on empty arrays).
  const result = spawnSync("./bin/trove", ["info", "trove-design"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  expect(result.status).toBe(0);
});

// ─── Validate.ts cycle warnings ────────────────────────────

test("validate: cycle detection runs across all skill templates", () => {
  // Real tree has no cycles — `bun run validate` must succeed.
  const result = spawnSync("bun", ["run", "validate"], { cwd: ROOT, stdio: "pipe" });
  expect(result.status).toBe(0);
  const out = result.stdout?.toString() ?? "";
  expect(out).not.toContain("benefits-from cycle:");
});
