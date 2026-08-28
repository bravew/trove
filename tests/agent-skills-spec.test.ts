/**
 * Agent Skills spec gate — negative fixtures.
 *
 * The blocking conformance gate is written in-repo from the published
 * specification (see scripts/lib/agent-skills-spec.ts and the plan's F14).
 * A validator nobody tests against bad input is not a gate, so every rule in
 * the Checkpoint 3 table gets a case that must fail.
 */

import { test, expect } from "bun:test";
import {
  DESCRIPTION_MAX,
  SPEC_FIELDS,
  SPEC_REVISION,
  validateAgentSkillFrontmatter,
} from "../scripts/lib/agent-skills-spec";
import {
  emitFrontmatter,
  foldTriggersIntoDescription,
  projectFrontmatter,
  toAuthoringSkill,
} from "../scripts/lib/projection";

const valid = { name: "trove-python", description: "Python conventions." };

function fieldsWithErrors(fm: Record<string, unknown>, expectedName?: string): string[] {
  return validateAgentSkillFrontmatter(fm, expectedName).errors.map((e) => e.field);
}

test("spec: a minimal well-formed skill passes", () => {
  const report = validateAgentSkillFrontmatter(valid, "trove-python");
  expect(report.errors).toEqual([]);
  expect(report.warnings).toEqual([]);
});

test("spec: the revision the gate was written from is recorded", () => {
  // A spec change must be a deliberate edit here, not silent drift.
  expect(SPEC_REVISION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect([...SPEC_FIELDS]).toEqual([
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
  ]);
});

// ─── name ───────────────────────────────────────────────────

test("spec: name is required", () => {
  expect(fieldsWithErrors({ description: "x" })).toContain("name");
});

test("spec: over-length name is rejected", () => {
  const name = `a${"b".repeat(64)}`;
  expect(fieldsWithErrors({ ...valid, name })).toContain("name");
});

test("spec: uppercase name is rejected", () => {
  expect(fieldsWithErrors({ ...valid, name: "Trove-Python" })).toContain("name");
});

test("spec: consecutive hyphens are rejected", () => {
  expect(fieldsWithErrors({ ...valid, name: "trove--python" })).toContain("name");
});

test("spec: leading and trailing hyphens are rejected", () => {
  expect(fieldsWithErrors({ ...valid, name: "-trove" })).toContain("name");
  expect(fieldsWithErrors({ ...valid, name: "trove-" })).toContain("name");
});

test("spec: name must equal the parent directory", () => {
  const errors = validateAgentSkillFrontmatter(valid, "trove-typescript").errors;
  expect(errors.length).toBe(1);
  expect(errors[0].message).toContain("parent directory");
});

// ─── description ────────────────────────────────────────────

test("spec: description is required and must be non-empty", () => {
  expect(fieldsWithErrors({ name: "trove-python" })).toContain("description");
  expect(fieldsWithErrors({ ...valid, description: "   " })).toContain("description");
});

test("spec: a 1025-character description is rejected", () => {
  expect(fieldsWithErrors({ ...valid, description: "d".repeat(DESCRIPTION_MAX + 1) })).toContain(
    "description",
  );
  expect(fieldsWithErrors({ ...valid, description: "d".repeat(DESCRIPTION_MAX) })).toEqual([]);
});

// ─── compatibility ──────────────────────────────────────────

test("spec: compatibility over 500 characters is rejected", () => {
  expect(fieldsWithErrors({ ...valid, compatibility: "c".repeat(501) })).toContain("compatibility");
  expect(fieldsWithErrors({ ...valid, compatibility: "c".repeat(500) })).toEqual([]);
});

// ─── metadata ───────────────────────────────────────────────

test("spec: non-string metadata values are rejected", () => {
  expect(fieldsWithErrors({ ...valid, metadata: { tier: 2 } })).toContain("metadata");
  expect(fieldsWithErrors({ ...valid, metadata: { tags: ["a", "b"] } })).toContain("metadata");
  expect(fieldsWithErrors({ ...valid, metadata: { source: "vercel-labs" } })).toEqual([]);
});

test("spec: metadata must be a mapping, not a list", () => {
  expect(fieldsWithErrors({ ...valid, metadata: ["a"] })).toContain("metadata");
});

// ─── unknown keys ───────────────────────────────────────────

test("spec: a leaked internal authoring key is rejected", () => {
  for (const leaked of ["version", "preamble-tier", "activation", "triggers", "benefits-from", "paths"]) {
    expect(fieldsWithErrors({ ...valid, [leaked]: "anything" })).toContain(leaked);
  }
});

test("spec: allowed-tools must be a space-separated string, not a list", () => {
  expect(fieldsWithErrors({ ...valid, "allowed-tools": ["Read", "Edit"] })).toContain("allowed-tools");
  expect(fieldsWithErrors({ ...valid, "allowed-tools": "Read Edit" })).toEqual([]);
});

test("spec: an allowed-tools entry broken by whitespace warns", () => {
  // `Bash(git *)` cannot survive the space-separated encoding; the two halves
  // arrive as separate, unbalanced tokens.
  const report = validateAgentSkillFrontmatter({ ...valid, "allowed-tools": "Bash(git *)" }, "trove-python");
  expect(report.errors).toEqual([]);
  expect(report.warnings.length).toBeGreaterThan(0);
});

// ─── Projection contract ────────────────────────────────────

const authoring = toAuthoringSkill(
  {
    name: "trove-demo",
    description: "Line one.\n  Line two.\n",
    version: "1.0.0",
    "preamble-tier": 2,
    "user-invocable": false,
    "benefits-from": ["trove-plan"],
    activation: { globs: ["**/*.py"] },
    triggers: ["python conventions", "fastapi patterns"],
  },
  "trove-demo",
);

const target = (profile: "claude" | "cursor" | "strict", hostName: string, tools = false) => ({
  profile,
  hostName,
  supportsToolAllowlist: tools,
});

test("projection: block-scalar descriptions flatten to one line", () => {
  expect(authoring.description).toBe("Line one. Line two.");
});

test("projection: internal authoring fields reach no host", () => {
  for (const profile of ["claude", "cursor", "strict"] as const) {
    const keys = Object.keys(projectFrontmatter(authoring, target(profile, profile)));
    for (const internal of ["version", "preamble-tier", "activation", "triggers", "benefits-from"]) {
      expect(keys).not.toContain(internal);
    }
  }
});

test("projection: claude maps activation.globs to paths and triggers to when_to_use", () => {
  const fm = projectFrontmatter(authoring, target("claude", "claude"));
  expect(fm.paths).toEqual(["**/*.py"]);
  expect(fm.when_to_use).toBe("python conventions; fastapi patterns");
  expect(fm["user-invocable"]).toBe(false);
});

test("projection: cursor gets paths but never a translated user-invocable", () => {
  const fm = projectFrontmatter(authoring, target("cursor", "cursor"));
  expect(fm.paths).toEqual(["**/*.py"]);
  expect(fm["user-invocable"]).toBeUndefined();
  expect(fm["disable-model-invocation"]).toBeUndefined();
});

test("projection: manual-only is emitted only from an explicit declaration", () => {
  const manual = toAuthoringSkill(
    { name: "trove-demo", description: "d", activation: { manual: true } },
    "trove-demo",
  );
  expect(projectFrontmatter(manual, target("cursor", "cursor"))["disable-model-invocation"]).toBe(true);
  expect(projectFrontmatter(manual, target("strict", "codex"))["disable-model-invocation"]).toBeUndefined();
});

test("projection: strict output passes the spec gate", () => {
  const fm = projectFrontmatter(authoring, target("strict", "codex"));
  expect(validateAgentSkillFrontmatter(fm, "trove-demo").errors).toEqual([]);
});

test("projection: host-overrides cannot smuggle a field past the allowlist", () => {
  const overridden = toAuthoringSkill(
    {
      name: "trove-demo",
      description: "d",
      "host-overrides": { cursor: { icon: "flask", version: "9.9.9" } },
    },
    "trove-demo",
  );
  const fm = projectFrontmatter(overridden, target("cursor", "cursor"));
  expect(fm.icon).toBe("flask");
  expect(fm.version).toBeUndefined();
});

test("projection: allowed-tools is withheld from hosts that ignore it", () => {
  const tooled = toAuthoringSkill(
    { name: "trove-demo", description: "d", "allowed-tools": ["Read", "Bash(git *)"] },
    "trove-demo",
  );
  expect(projectFrontmatter(tooled, target("strict", "codex", false))["allowed-tools"]).toBeUndefined();
  expect(projectFrontmatter(tooled, target("claude", "claude", true))["allowed-tools"]).toEqual([
    "Read",
    "Bash(git *)",
  ]);
});

test("projection: folded triggers never push description past the spec cap", () => {
  const base = "x".repeat(DESCRIPTION_MAX - 10);
  const folded = foldTriggersIntoDescription(base, ["a very long trigger phrase", "another one"]);
  expect(folded.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  expect(folded.startsWith(base)).toBe(true);
});

// ─── YAML emission ──────────────────────────────────────────

test("emit: punctuation and glob leaders are quoted, plain names are not", () => {
  const yaml = emitFrontmatter({
    name: "trove-demo",
    description: 'Uses a: colon, and a "quote".',
    paths: ["**/*.py"],
    "user-invocable": false,
    metadata: { source: "vercel-labs/agent-skills" },
  });
  expect(yaml).toMatch(/^name: trove-demo$/m);
  expect(yaml).toMatch(/^description: "Uses a: colon, and a \\"quote\\"\."$/m);
  expect(yaml).toMatch(/^  - "\*\*\/\*\.py"$/m);
  expect(yaml).toMatch(/^user-invocable: false$/m);
  expect(yaml).toMatch(/^  source: vercel-labs\/agent-skills$/m);
});

test("emit: output round-trips through a YAML parser", async () => {
  const YAML = (await import("yaml")).default;
  const fields = projectFrontmatter(authoring, target("claude", "claude"));
  const text = emitFrontmatter(fields);
  const parsed = YAML.parse(text.slice(4, text.lastIndexOf("\n---")));
  expect(parsed).toEqual(fields);
});
