import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  applyVallyBaseline,
  calculateScore,
  compareTrend,
  parseVallyOutput,
  QUALITY_REPORT_VERSION,
  renderQualityMarkdown,
  validateQualityReport,
  vallyFindingKey,
  type QualityDimension,
  type QualityReport,
} from "../scripts/lib/quality-report";

const ROOT = path.resolve(import.meta.dir, "..");

const dimensions = (): QualityDimension[] => [
  { id: "structure", weight: 20, status: "passed", numerator: 20, denominator: 20, evidence: ["validate"] },
  { id: "host", weight: 20, status: "passed", numerator: 20, denominator: 20, evidence: ["smoke"] },
  { id: "lint", weight: 15, status: "passed", numerator: 12, denominator: 15, evidence: ["vally"] },
  { id: "behavior", weight: 25, status: "unavailable", numerator: null, denominator: 25, evidence: ["model unavailable"] },
  { id: "docs", weight: 10, status: "passed", numerator: 10, denominator: 10, evidence: ["validate"] },
  { id: "provenance", weight: 10, status: "passed", numerator: 10, denominator: 10, evidence: ["validate"] },
];

function report(overrides: Partial<QualityReport> = {}): QualityReport {
  return {
    schemaVersion: QUALITY_REPORT_VERSION,
    generatedAt: "2026-09-10T00:00:00.000Z",
    repository: { commit: "a".repeat(40) },
    scope: { kind: "all", files: [], skills: ["trove-test"], plugins: ["trove-dev"] },
    rules: { fingerprint: "b".repeat(64), formula: "trove-score-v1", vallyBaseline: "quality/vally-baseline.v1.json" },
    tools: { bun: "1.3.11", node: "v22.12.0", vally: "0.15.0" },
    checks: [],
    hardBlockers: [],
    dimensions: dimensions(),
    score: null,
    coverage: 75,
    trend: { status: "unavailable", reason: "no previous report", dimensionDeltas: {} },
    ...overrides,
  };
}

describe("quality report", () => {
  test("parses Vally leaf findings and preserves their grader", () => {
    const output = [
      "❌ trove-review (0/2 checks passed, 2 failed)",
      "    ✗ spec-compliance: Spec checks failed.",
      "        ✗ Allowed-tools field must be a space-delimited string, got object.",
      "    ✗ valid-refs: Found 1 invalid file reference(s): ../../docs/orchestration.md (outside-skill-dir) at line 87.",
    ].join("\n");
    expect(parseVallyOutput(output).map(vallyFindingKey)).toEqual([
      "trove-review|spec-compliance|Allowed-tools field must be a space-delimited string, got object.",
      "trove-review|valid-refs|Found 1 invalid file reference(s): ../../docs/orchestration.md (outside-skill-dir) at line 87.",
    ]);
  });

  test("accepted Vally findings become visible warnings while new rules still block", () => {
    const findings = parseVallyOutput("❌ sample (0/1)\n    ✗ new-rule: failed\n");
    expect(applyVallyBaseline(findings, new Set(["sample|new-rule|failed"]))[0]).toMatchObject({
      severity: "warning",
      baseline: true,
    });
    expect(applyVallyBaseline(findings, new Set())[0]?.severity).toBe("error");
  });

  test("suppresses the overall score while required evidence is unavailable", () => {
    expect(calculateScore(dimensions())).toEqual({ score: null, coverage: 75 });
    const complete = dimensions().map((dimension) => dimension.id === "behavior"
      ? { ...dimension, status: "passed" as const, numerator: 25 }
      : dimension);
    expect(calculateScore(complete)).toEqual({ score: 97, coverage: 100 });
  });

  test("compares trends only across matching schema, rules, and scope", () => {
    const current = report();
    expect(compareTrend(current, report()).status).toBe("compared");
    expect(compareTrend(current, report({ rules: { ...current.rules, fingerprint: "c".repeat(64) } })).status)
      .toBe("incomparable");
  });

  test("validates and renders the versioned JSON artifact", () => {
    const value = report();
    expect(validateQualityReport(value)).toEqual([]);
    expect(validateQualityReport({ ...value, repository: { commit: "short" } })).toContain(
      "repository.commit must be a full SHA",
    );
    expect(renderQualityMarkdown(value)).toContain("suppressed until all dimensions are comparable");
  });

  test("quality workflows are read-only, immutable, pinned, and retain reports", () => {
    const workflows = ["skill-check.yml", "skill-quality-report.yml"].map((name) =>
      fs.readFileSync(path.join(ROOT, ".github", "workflows", name), "utf8"));
    for (const workflow of workflows) {
      const refs = [...workflow.matchAll(/uses:\s*[^@\s]+@([^\s]+)/g)].map((match) => match[1]);
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.every((ref) => /^[0-9a-f]{40}$/.test(ref))).toBe(true);
      expect(workflow).toContain("contents: read");
      expect(workflow).not.toContain("pull-requests: write");
      expect(workflow).toContain("node-version: 22.12.0");
      expect(workflow).toContain("bun-version: 1.3.11");
      expect(workflow).toContain("retention-days: 90");
    }
    expect(workflows[0]).toContain("github.event.pull_request.base.sha");
    expect(workflows[1]).toContain("actions: read");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies["@microsoft/vally-cli"]).toBe("0.15.0");
  });

  test("the JSON schema fixes the report and formula versions", () => {
    const schema = JSON.parse(fs.readFileSync(
      path.join(ROOT, "schemas", "quality-report.v1.schema.json"),
      "utf8",
    )) as { properties: { schemaVersion: { const: string }; rules: { properties: { formula: { const: string } } } } };
    expect(schema.properties.schemaVersion.const).toBe(QUALITY_REPORT_VERSION);
    expect(schema.properties.rules.properties.formula.const).toBe("trove-score-v1");
  });
});
