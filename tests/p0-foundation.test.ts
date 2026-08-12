/**
 * P0 — Foundation tests.
 *
 * Pins the canonical projection of `trove-python` across host surfaces, plus
 * typed-resolver and v2-schema unit coverage. Snapshot
 * regressions surface here before they reach the host outputs.
 */

import { test, expect, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { validateV2Frontmatter } from "../scripts/schema";
import { resolvers } from "../scripts/resolvers/index";
import { ALL_HOSTS } from "../hosts/index";
import { buildOnceForTests } from "./helpers/build";

const ROOT = path.resolve(import.meta.dir, "..");
const OUTPUT = path.join(ROOT, "output");

beforeAll(buildOnceForTests, 120_000);

// ─── HostCapabilities ──────────────────────────────────────

test("hosts: every host declares a capabilities map", () => {
  for (const host of ALL_HOSTS) {
    expect(host.capabilities).toBeDefined();
    expect(typeof host.capabilities.supportsInlineSkill).toBe("boolean");
    expect(typeof host.capabilities.supportsRuleFiles).toBe("boolean");
    expect(typeof host.capabilities.supportsImportedMemory).toBe("boolean");
    expect(typeof host.capabilities.supportsAgentsMd).toBe("boolean");
    expect(typeof host.capabilities.supportsToolAllowlistMetadata).toBe("boolean");
  }
});

test("hosts: capabilities reflect intended projection surfaces", () => {
  const byName = Object.fromEntries(ALL_HOSTS.map((h) => [h.name, h]));
  // Claude — full skills + imported memory, no rule files
  expect(byName.claude.capabilities.supportsInlineSkill).toBe(true);
  expect(byName.claude.capabilities.supportsImportedMemory).toBe(true);
  expect(byName.claude.capabilities.supportsRuleFiles).toBe(false);
  // Cursor — native skills plus rule files for scoped/always-on context.
  expect(byName.cursor.capabilities.supportsRuleFiles).toBe(true);
  expect(byName.cursor.capabilities.supportsInlineSkill).toBe(true);
  // Codex — inline skill, no rule files, treats AGENTS.md as fallback
  expect(byName.codex.capabilities.supportsInlineSkill).toBe(true);
  expect(byName.codex.capabilities.supportsAgentsMd).toBe(true);
  // Generic agents — AGENTS.md only
  expect(byName.agents.capabilities.supportsAgentsMd).toBe(true);
  expect(byName.agents.capabilities.supportsInlineSkill).toBe(false);
  expect(byName.agents.capabilities.supportsRuleFiles).toBe(false);
});

// ─── Typed resolver registry ───────────────────────────────

test("resolvers: VERSION returns marketplace version from context", () => {
  const result = resolvers.VERSION({ marketplaceVersion: "9.9.9", projectRoot: ROOT });
  expect(result.mode).toBe("inline");
  expect(result.value).toBe("9.9.9");
});

test("resolvers: PREAMBLE defaults to tier 2 with no skill or args", () => {
  const result = resolvers.PREAMBLE({ marketplaceVersion: "1.2.3", projectRoot: ROOT });
  expect(result.mode).toBe("inline");
  expect(result.value).toContain("Trove · v1.2.3");
  expect(result.value).toContain("Session Init");
});

test("resolvers: PREAMBLE explicit arg overrides skill frontmatter", () => {
  const result = resolvers.PREAMBLE({
    marketplaceVersion: "1.0.0",
    projectRoot: ROOT,
    args: ["1"],
    skill: {
      name: "x",
      description: "",
      templatePath: "",
      skillDir: "",
      rawFrontmatter: "",
      v2: { preambleTier: 4 },
    },
  });
  // tier-1 has no Session Init heading
  expect(result.value).not.toContain("Session Init");
  expect(result.value).toContain("Trove");
});

test("resolvers: PREAMBLE reads tier from skill frontmatter when no arg", () => {
  const result = resolvers.PREAMBLE({
    marketplaceVersion: "1.0.0",
    projectRoot: ROOT,
    skill: {
      name: "x",
      description: "",
      templatePath: "",
      skillDir: "",
      rawFrontmatter: "",
      v2: { preambleTier: 4 },
    },
  });
  // tier-4 includes orchestrator + delegation language
  expect(result.value).toContain("orchestrator");
  expect(result.value).toContain("delegation");
});

test("resolvers: PREAMBLE rejects invalid tier", () => {
  expect(() =>
    resolvers.PREAMBLE({ marketplaceVersion: "1.0.0", projectRoot: ROOT, args: ["7"] }),
  ).toThrow("tier must be an integer 1-4");
});

// ─── Frontmatter v2 schema ─────────────────────────────────

test("schema: minimal frontmatter with no v2 fields produces no findings", () => {
  const report = validateV2Frontmatter({ name: "trove-x", description: "ok" }, new Set());
  expect(report.errors).toEqual([]);
  expect(report.warnings).toEqual([]);
});

test("schema: well-formed v2 fields produce no findings", () => {
  const report = validateV2Frontmatter(
    {
      name: "trove-x",
      description: "ok",
      version: "1.2.3",
      "preamble-tier": 2,
      triggers: ["a", "b"],
      activation: { globs: ["**/*.ts"] },
    },
    new Set(["trove-x"]),
  );
  expect(report.errors).toEqual([]);
});

test("schema: invalid version is an error", () => {
  const report = validateV2Frontmatter({ version: "not-semver" }, new Set());
  expect(report.errors.length).toBe(1);
  expect(report.errors[0].message).toContain("'version' must be semver");
});

test("schema: out-of-range preamble-tier is an error", () => {
  const report = validateV2Frontmatter({ "preamble-tier": 7 }, new Set());
  expect(report.errors.length).toBe(1);
  expect(report.errors[0].message).toContain("preamble-tier");
});

test("schema: non-integer preamble-tier is an error", () => {
  const report = validateV2Frontmatter({ "preamble-tier": "two" }, new Set());
  expect(report.errors.length).toBe(1);
  expect(report.errors[0].message).toContain("must be an integer");
});

test("schema: non-array triggers is an error", () => {
  const report = validateV2Frontmatter({ triggers: "code review" }, new Set());
  expect(report.errors.length).toBe(1);
  expect(report.errors[0].message).toContain("must be an array");
});

test("schema: empty activation.globs is an error", () => {
  const report = validateV2Frontmatter({ activation: { globs: [] } }, new Set());
  expect(report.errors.length).toBe(1);
  expect(report.errors[0].message).toContain("non-empty array");
});

test("schema: unknown allowed-tools is a warning, not an error", () => {
  const report = validateV2Frontmatter({ "allowed-tools": ["MadeUpTool"] }, new Set());
  expect(report.errors).toEqual([]);
  expect(report.warnings.length).toBe(1);
  expect(report.warnings[0].message).toContain("unknown tool 'MadeUpTool'");
});

test("schema: known tools (incl. Task and Agent) produce no findings", () => {
  // `Task` and `Agent` are both names Claude Code has used for the
  // sub-agent dispatch tool; both must be accepted to avoid spurious
  // warnings on real-world skills.
  const report = validateV2Frontmatter(
    { "allowed-tools": ["Read", "Write", "Edit", "Bash", "Task", "Agent", "WebFetch"] },
    new Set(),
  );
  expect(report.errors).toEqual([]);
  expect(report.warnings).toEqual([]);
});

test("schema: Claude tool patterns in allowed-tools produce no findings", () => {
  const report = validateV2Frontmatter(
    { "allowed-tools": ["Bash(git *)", "Bash(gh pr *)", "Read"] },
    new Set(),
  );
  expect(report.errors).toEqual([]);
  expect(report.warnings).toEqual([]);
});

test("schema: benefits-from referencing unknown skill warns", () => {
  const report = validateV2Frontmatter({ "benefits-from": ["trove-ghost"] }, new Set(["trove-real"]));
  expect(report.errors).toEqual([]);
  expect(report.warnings.length).toBe(1);
  expect(report.warnings[0].message).toContain("unknown skill 'trove-ghost'");
});

test("schema: host-overrides keyed by unknown host is an error", () => {
  const report = validateV2Frontmatter(
    { "host-overrides": { unknownhost: { foo: 1 } } },
    new Set(),
  );
  expect(report.errors.length).toBe(1);
  expect(report.errors[0].message).toContain("unknown host");
});

// ─── Per-host snapshot of trove-python ──────────────────────
//
// trove-python is the canonical projection target — it exercises auto-attach
// (paths/globs), description block scalar, and triggers. Pinning these
// outputs catches accidental projection drift.

test("snapshot: trove-python projects identically into Claude SKILL.md", () => {
  const out = fs.readFileSync(path.join(ROOT, "skills", "coding", "trove-python", "SKILL.md"), "utf-8");
  // Frontmatter shape: v2 fields present, no legacy `paths:`.
  expect(out).toMatch(/^name: trove-python$/m);
  expect(out).toMatch(/^version: 1\.0\.0$/m);
  expect(out).toMatch(/^preamble-tier: 2$/m);
  expect(out).toMatch(/^activation:$/m);
  expect(out).toMatch(/^\s+globs:$/m);
  expect(out).toMatch(/^\s+- "\*\*\/\*\.py"$/m);
  expect(out).toMatch(/^triggers:$/m);
  expect(out).not.toMatch(/^paths:/m);
  // Body shape: tier-2 preamble + content.
  expect(out).toContain("Trove · v");
  expect(out).toContain("Python / FastAPI Conventions");
});

test("snapshot: trove-python projects to Cursor MDC with comma-separated globs", () => {
  const mdc = fs.readFileSync(path.join(OUTPUT, "cursor", "rules", "trove-python.mdc"), "utf-8");
  expect(mdc.startsWith("---\n")).toBe(true);
  const fm = mdc.slice(4, mdc.indexOf("\n---", 4));
  expect(fm).toMatch(/^description: ".+"$/m);
  expect(fm).toMatch(/^globs: \*\*\/\*\.py$/m);
  expect(fm).toMatch(/^alwaysApply: false$/m);
  // Body content present.
  expect(mdc).toContain("Python / FastAPI Conventions");
});

test("snapshot: trove-python projects to Codex .agents/skills with minimal frontmatter", () => {
  const codex = fs.readFileSync(
    path.join(OUTPUT, "codex", ".agents", "skills", "trove-python", "SKILL.md"),
    "utf-8",
  );
  expect(codex).toMatch(/^name: trove-python$/m);
  expect(codex).toMatch(/^description: "Python\/FastAPI coding conventions and best practices\. Auto-activates when working with Python files\. Covers async patterns, type hints, SQLAlchemy, Pydantic, logging, and error handling\."$/m);
  expect(codex).not.toMatch(/^version:/m);
  expect(codex).not.toMatch(/^activation:/m);
  expect(codex).not.toMatch(/^triggers:/m);
  expect(codex).not.toMatch(/^paths:/m);
  expect(codex).toContain("Python / FastAPI Conventions");
});

test("snapshot: trove-python is included in the trove-dev scoped AGENTS.md", () => {
  const agents = fs.readFileSync(
    path.join(OUTPUT, "agents", "plugins", "trove-dev", "AGENTS.md"),
    "utf-8",
  );
  expect(agents).toContain("## trove-python");
  expect(agents).toContain("Python / FastAPI Conventions");
});
