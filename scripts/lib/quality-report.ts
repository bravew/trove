import * as fs from "fs";

export const QUALITY_REPORT_VERSION = "trove.quality-report.v1" as const;

export type ResultStatus = "passed" | "failed" | "skipped" | "unavailable";
export type DimensionStatus = "passed" | "failed" | "unavailable";

export interface QualityFinding {
  source: string;
  severity: "error" | "warning";
  rule: string;
  message: string;
  skill?: string;
  baseline?: boolean;
}

export interface QualityCheck {
  id: string;
  status: ResultStatus;
  blocking: boolean;
  findings: QualityFinding[];
}

export interface QualityDimension {
  id: string;
  weight: number;
  status: DimensionStatus;
  numerator: number | null;
  denominator: number;
  evidence: string[];
}

export interface QualityReport {
  schemaVersion: typeof QUALITY_REPORT_VERSION;
  generatedAt: string;
  repository: { commit: string; base?: string; head?: string };
  scope: { kind: "all" | "changed"; files: string[]; skills: string[]; plugins: string[] };
  rules: { fingerprint: string; formula: "trove-score-v1"; vallyBaseline: "quality/vally-baseline.v1.json" };
  tools: Record<string, string>;
  checks: QualityCheck[];
  hardBlockers: QualityFinding[];
  dimensions: QualityDimension[];
  score: number | null;
  coverage: number;
  trend: { status: "compared" | "unavailable" | "incomparable"; reason: string; dimensionDeltas: Record<string, number> };
}

export function vallyFindingKey(finding: Pick<QualityFinding, "skill" | "rule" | "message">): string {
  return `${finding.skill ?? ""}|${finding.rule}|${finding.message}`;
}

export function parseVallyOutput(output: string): QualityFinding[] {
  const findings: QualityFinding[] = [];
  let skill: string | undefined;
  let pending: QualityFinding | undefined;
  const flush = (): void => {
    if (pending) findings.push(pending);
    pending = undefined;
  };

  for (const raw of output.replace(/\u001b\[[0-9;]*m/g, "").split("\n")) {
    const skillMatch = raw.match(/^[❌✅]\s+([^\s]+)\s/);
    if (skillMatch) {
      flush();
      skill = skillMatch[1];
      continue;
    }
    const leaf = raw.match(/^(\s*)[✗⚠]\s+(.+)$/);
    if (!leaf || !skill) continue;
    const severity = raw.includes("⚠") ? "warning" : "error";
    if (leaf[1].length >= 8 && pending) {
      findings.push({ ...pending, severity, message: leaf[2].trim() });
      pending = undefined;
      continue;
    }
    const item = raw.match(/^(\s*)[✗⚠]\s+([^:]+):\s+(.+)$/);
    if (!item) continue;
    const finding: QualityFinding = {
      source: "vally",
      severity,
      rule: item[2].trim(),
      message: item[3].trim(),
      skill,
    };
    flush();
    pending = finding;
  }
  flush();
  return findings;
}

export function applyVallyBaseline(findings: QualityFinding[], keys: Set<string>): QualityFinding[] {
  return findings.map((finding) => keys.has(vallyFindingKey(finding))
    ? { ...finding, severity: "warning", baseline: true }
    : finding);
}

export function calculateScore(dimensions: QualityDimension[]): { score: number | null; coverage: number } {
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const availableWeight = dimensions
    .filter((dimension) => dimension.status !== "unavailable")
    .reduce((sum, dimension) => sum + dimension.weight, 0);
  const coverage = Math.round((availableWeight / totalWeight) * 1000) / 10;
  if (availableWeight !== totalWeight) return { score: null, coverage };
  const score = dimensions.reduce((sum, dimension) => {
    if (dimension.numerator === null || dimension.denominator === 0) return sum;
    return sum + (dimension.numerator / dimension.denominator) * dimension.weight;
  }, 0);
  return { score: Math.round(score * 10) / 10, coverage };
}

export function compareTrend(current: QualityReport, previous?: QualityReport): QualityReport["trend"] {
  if (!previous) return { status: "unavailable", reason: "no previous report", dimensionDeltas: {} };
  const comparable = previous.schemaVersion === current.schemaVersion
    && previous.rules.fingerprint === current.rules.fingerprint
    && previous.scope.kind === current.scope.kind
    && JSON.stringify(previous.scope.skills) === JSON.stringify(current.scope.skills);
  if (!comparable) return { status: "incomparable", reason: "schema, rules, or scope differ", dimensionDeltas: {} };
  const prior = new Map(previous.dimensions.map((dimension) => [dimension.id, dimension]));
  const dimensionDeltas: Record<string, number> = {};
  for (const dimension of current.dimensions) {
    const before = prior.get(dimension.id);
    if (dimension.numerator !== null && before?.numerator !== null && before?.numerator !== undefined) {
      dimensionDeltas[dimension.id] = Math.round((dimension.numerator - before.numerator) * 10) / 10;
    }
  }
  return { status: "compared", reason: "matching schema, rules, and scope", dimensionDeltas };
}

export function validateQualityReport(report: unknown): string[] {
  const errors: string[] = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) return ["report must be an object"];
  const value = report as Partial<QualityReport>;
  if (value.schemaVersion !== QUALITY_REPORT_VERSION) errors.push(`schemaVersion must be ${QUALITY_REPORT_VERSION}`);
  if (!value.generatedAt || Number.isNaN(Date.parse(value.generatedAt))) errors.push("generatedAt must be an ISO date-time");
  if (!value.repository || !/^[0-9a-f]{40}$/.test(value.repository.commit ?? "")) errors.push("repository.commit must be a full SHA");
  if (!value.scope || !["all", "changed"].includes(value.scope.kind ?? "")) errors.push("scope.kind must be all or changed");
  if (!Array.isArray(value.checks)) errors.push("checks must be an array");
  if (!Array.isArray(value.hardBlockers)) errors.push("hardBlockers must be an array");
  if (!Array.isArray(value.dimensions) || value.dimensions.reduce((sum, item) => sum + item.weight, 0) !== 100) {
    errors.push("dimension weights must total 100");
  }
  if (typeof value.coverage !== "number" || value.coverage < 0 || value.coverage > 100) errors.push("coverage must be 0..100");
  if (value.score !== null && (typeof value.score !== "number" || value.score < 0 || value.score > 100)) errors.push("score must be null or 0..100");
  return errors;
}

export function renderQualityMarkdown(report: QualityReport): string {
  const lines = [
    `# Trove quality report`,
    "",
    `Commit: \`${report.repository.commit}\`  `,
    `Scope: **${report.scope.kind}** (${report.scope.skills.length} skills, ${report.scope.plugins.length} plugins)  `,
    `Coverage: **${report.coverage.toFixed(1)}%**  `,
    `Score: **${report.score === null ? "suppressed until all dimensions are comparable" : `${report.score.toFixed(1)}/100`}**`,
    "",
    "| Dimension | Weight | Status | Result |",
    "| --- | ---: | --- | ---: |",
  ];
  for (const dimension of report.dimensions) {
    const result = dimension.numerator === null ? "unavailable" : `${dimension.numerator}/${dimension.denominator}`;
    lines.push(`| ${dimension.id} | ${dimension.weight} | ${dimension.status} | ${result} |`);
  }
  lines.push("", `## Hard blockers (${report.hardBlockers.length})`, "");
  if (report.hardBlockers.length === 0) lines.push("None.");
  else for (const finding of report.hardBlockers) lines.push(`- **${finding.rule}**: ${finding.message}`);
  const warnings = report.checks.flatMap((check) => check.findings).filter((finding) => finding.severity === "warning");
  lines.push("", `## Warnings (${warnings.length})`, "");
  if (warnings.length === 0) lines.push("None.");
  else for (const finding of warnings) lines.push(`- **${finding.skill ?? finding.source} / ${finding.rule}**: ${finding.message}${finding.baseline ? " (accepted baseline)" : ""}`);
  lines.push("", `Trend: **${report.trend.status}** — ${report.trend.reason}`);
  for (const [id, delta] of Object.entries(report.trend.dimensionDeltas)) lines.push(`- ${id}: ${delta >= 0 ? "+" : ""}${delta}`);
  return `${lines.join("\n")}\n`;
}

export function readQualityReport(file: string): QualityReport {
  const report = JSON.parse(fs.readFileSync(file, "utf8")) as QualityReport;
  const errors = validateQualityReport(report);
  if (errors.length > 0) throw new Error(`invalid previous quality report: ${errors.join("; ")}`);
  return report;
}
