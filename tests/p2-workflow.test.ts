/**
 * P2 — Workflow surface tests.
 *
 * Covers preamble tier resolution, trigger projection, routing index
 * generation, and decision-gate lint behavior. Each section runs against
 * fresh build output (`beforeAll`) and isolated fixtures (decision gates).
 */

import { test, expect, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { buildOnceForTests } from "./helpers/build";

const ROOT = path.resolve(import.meta.dir, "..");
const OUTPUT = path.join(ROOT, "output");

beforeAll(buildOnceForTests, 120_000);

// ─── Preamble tiers ────────────────────────────────────────

test("preamble: tier-2 default injected with version stamp", () => {
  // trove-python uses {{PREAMBLE}} (no arg) — must produce tier 2 content.
  const skill = fs.readFileSync(path.join(ROOT, "skills", "coding", "trove-python", "SKILL.md"), "utf-8");
  expect(skill).toMatch(/Trove · v\d+\.\d+\.\d+/);
  expect(skill).toContain("## Session Init");
  expect(skill).toContain("Prefer existing project patterns");
});

test("preamble: tier files exist for all four tiers", () => {
  for (const n of [1, 2, 3, 4]) {
    expect(fs.existsSync(path.join(ROOT, "templates", `preamble-tier-${n}.md`))).toBe(true);
  }
});

test("preamble: tier-1 omits Session Init section", () => {
  const tier1 = fs.readFileSync(path.join(ROOT, "templates", "preamble-tier-1.md"), "utf-8");
  expect(tier1).toContain("Trove");
  expect(tier1).not.toContain("Session Init");
});

test("preamble: tier-3 adds routing pointer, tier-4 adds delegation reminder", () => {
  const tier3 = fs.readFileSync(path.join(ROOT, "templates", "preamble-tier-3.md"), "utf-8");
  const tier4 = fs.readFileSync(path.join(ROOT, "templates", "preamble-tier-4.md"), "utf-8");
  expect(tier3).toContain("routing index");
  expect(tier4).toContain("orchestrator");
  expect(tier4).toContain("delegation");
});

// ─── Trigger metadata rollout ──────────────────────────────

test("triggers: every maintained skill template declares triggers", () => {
  const skillsDir = path.join(ROOT, "skills");
  const tmpls: string[] = [];
  function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "SKILL.md.tmpl") tmpls.push(full);
    }
  }
  walk(skillsDir);
  expect(tmpls.length).toBeGreaterThan(0);

  for (const tmpl of tmpls) {
    const fm = fs.readFileSync(tmpl, "utf-8");
    expect(fm).toMatch(/^triggers:/m);
  }
});

test("triggers: pass through to Claude SKILL.md but not minimal Codex SKILL.md", () => {
  const claudeSkill = fs.readFileSync(path.join(ROOT, "skills", "coding", "trove-python", "SKILL.md"), "utf-8");
  expect(claudeSkill).toMatch(/^triggers:/m);
  expect(claudeSkill).toContain("- python conventions");

  const codexSkill = fs.readFileSync(
    path.join(OUTPUT, "codex", ".agents", "skills", "trove-python", "SKILL.md"),
    "utf-8",
  );
  expect(codexSkill).not.toMatch(/^triggers:/m);
});

// ─── Routing index ─────────────────────────────────────────

test("routing: docs/routing.md exists and groups skills by plugin", () => {
  const routing = fs.readFileSync(path.join(ROOT, "docs", "routing.md"), "utf-8");
  expect(routing).toContain("# Routing Index");
  expect(routing).toContain("## trove-dev");
  expect(routing).toContain("## trove-design");
});

test("routing: includes triggers and paths columns for each skill", () => {
  const routing = fs.readFileSync(path.join(ROOT, "docs", "routing.md"), "utf-8");
  // trove-python row should have all four parts: name, description, triggers, paths.
  expect(routing).toContain("**trove-python**");
  expect(routing).toContain("`python conventions`");
  expect(routing).toContain("`**/*.py`");
});

test("routing: dry-run reports fresh after build", () => {
  const result = spawnSync("bun", ["run", "build:routing", "--", "--dry-run"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  expect(result.status).toBe(0);
  expect(result.stdout?.toString() ?? "").toContain("FRESH:");
});

// ─── Decision-gate lint ────────────────────────────────────

import { lintDecisionGates } from "../scripts/lib/decision-gate";

test("decision-gate lint: well-formed gate produces no findings", () => {
  const findings = lintDecisionGates(
    "## Decision Gate: test strategy\n\n" +
      "Context: This change affects deployment confidence.\n" +
      "Question: Should I optimize for iteration speed or broader coverage?\n" +
      "Options:\n" +
      "- A. Add broader tests before shipping.\n" +
      "- B. Ship the fix with narrow tests only.\n" +
      "Default: A, because it lowers regression risk.\n",
  );
  expect(findings).toEqual([]);
});

test("decision-gate lint: missing options is a hard error", () => {
  const findings = lintDecisionGates(
    "## Decision Gate: deploy strategy\n\n" +
      "Context: Production traffic is sensitive to downtime.\n" +
      "Question: Roll out to all regions at once?\n" +
      "Default: stage to a canary first.\n",
  );
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.length).toBe(1);
  expect(errors[0].topic).toBe("deploy strategy");
  expect(errors[0].message).toContain("missing 'Options:'");
});

test("decision-gate lint: missing default is a warning, not an error", () => {
  const findings = lintDecisionGates(
    "## Decision Gate: archive policy\n\n" +
      "Context: Old logs need a retention window.\n" +
      "Question: Glacier or delete?\n" +
      "Options:\n" +
      "- A. Move to Glacier with 90-day retention.\n" +
      "- B. Delete after 30 days.\n",
  );
  const warnings = findings.filter((f) => f.severity === "warning");
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.length).toBe(0);
  expect(warnings.some((w) => w.message.includes("missing 'Default:'"))).toBe(true);
});

test("decision-gate lint: missing context warns, not errors", () => {
  const findings = lintDecisionGates(
    "## Decision Gate: rollback policy\n\n" +
      "Question: Auto-rollback on health check failure?\n" +
      "Options:\n" +
      "- A. Yes, on any 5xx burst.\n" +
      "- B. No, page the on-call instead.\n" +
      "Default: A, because revert is faster than diagnosis at 2am.\n",
  );
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  expect(errors.length).toBe(0);
  expect(warnings.some((w) => w.message.includes("missing 'Context:'"))).toBe(true);
});

test("decision-gate lint: plain bullets without letter prefix don't satisfy options", () => {
  const findings = lintDecisionGates(
    "## Decision Gate: cache strategy\n\n" +
      "Context: Hot path is read-heavy.\n" +
      "Question: Where do we put the cache?\n" +
      "Options:\n" +
      "- In Redis with a 60s TTL.\n" +
      "- In-process LRU.\n" +
      "Default: Redis.\n",
  );
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.length).toBe(1);
  expect(errors[0].message).toContain("lettered choices");
});

test("decision-gate lint: skills with no Decision Gate produce no findings", () => {
  expect(lintDecisionGates("# Just a normal skill body\n\nNothing to see here.")).toEqual([]);
});

test("decision-gate lint: multiple gates each linted independently", () => {
  const findings = lintDecisionGates(
    "## Decision Gate: first\n\n" +
      "Context: c1\nQuestion: q1\nOptions:\n- A. a\n- B. b\nDefault: A\n\n" +
      "## Decision Gate: second\n\n" +
      "Question: q2\nOptions:\n- A. a\n- B. b\nDefault: B\n",
  );
  // first is well-formed, second is missing Context
  expect(findings.length).toBe(1);
  expect(findings[0].topic).toBe("second");
  expect(findings[0].message).toContain("missing 'Context:'");
});
