#!/usr/bin/env bun

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import YAML from "yaml";
import { changedFilesFromMergeBase, maintainedSkills, skillsAffectedByFiles, validateEvalStructure } from "./lib/eval-structure";
import {
  applyVallyBaseline,
  calculateScore,
  compareTrend,
  parseVallyOutput,
  QUALITY_REPORT_VERSION,
  readQualityReport,
  renderQualityMarkdown,
  validateQualityReport,
  type QualityCheck,
  type QualityDimension,
  type QualityFinding,
  type QualityReport,
} from "./lib/quality-report";

const ROOT = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const outputPath = path.resolve(ROOT, option("output") ?? "quality-report.v1.json");
const markdownPath = path.resolve(ROOT, option("markdown") ?? "quality-report.md");
const renderPath = option("render");

if (renderPath) {
  const report = readQualityReport(path.resolve(ROOT, renderPath));
  fs.writeFileSync(markdownPath, renderQualityMarkdown(report));
  process.exit(0);
}

const scopeKind = option("scope") === "changed" ? "changed" : "all";
const base = option("base") ?? process.env.QUALITY_BASE_REF ?? "origin/main";
const head = option("head") ?? process.env.QUALITY_HEAD_REF ?? "HEAD";
const withInstall = args.includes("--with-install");

interface CommandResult {
  status: number | null;
  output: string;
}

function run(command: string, commandArgs: string[]): CommandResult {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", VALLY_TELEMETRY_OPTOUT: "1", DO_NOT_TRACK: "1" },
    maxBuffer: 16 * 1024 * 1024,
  });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function commandCheck(id: string, command: string, commandArgs: string[]): QualityCheck {
  const result = run(command, commandArgs);
  const findings: QualityFinding[] = [];
  if (result.status !== 0) {
    findings.push({
      source: id,
      severity: "error",
      rule: `${id}-failed`,
      message: result.status === null
        ? `could not execute ${command}`
        : result.output.trim().split("\n").slice(-8).join(" ").slice(0, 2000),
    });
  }
  return { id, status: result.status === 0 ? "passed" : "failed", blocking: true, findings };
}

function canonicalSkillDirectory(skill: string): string {
  for (const category of fs.readdirSync(path.join(ROOT, "skills"))) {
    const candidate = path.join(ROOT, "skills", category, skill);
    if (fs.existsSync(path.join(candidate, "SKILL.md"))) return candidate;
  }
  throw new Error(`canonical skill directory not found: ${skill}`);
}

function pluginsForSkills(skills: string[]): string[] {
  const selected = new Set(skills);
  const plugins: string[] = [];
  for (const plugin of fs.readdirSync(path.join(ROOT, "plugins"))) {
    const manifestPath = path.join(ROOT, "plugins", plugin, "plugin.yaml");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf8")) as { skills?: Array<{ path: string }> };
    if ((manifest.skills ?? []).some((entry) => selected.has(path.basename(entry.path)))) plugins.push(plugin);
  }
  return plugins.sort();
}

const files = scopeKind === "changed" ? changedFilesFromMergeBase(ROOT, base, head) : [];
const skills = scopeKind === "changed" ? skillsAffectedByFiles(ROOT, files) : maintainedSkills(ROOT);
const plugins = pluginsForSkills(skills);
const checks: QualityCheck[] = [];

checks.push(commandCheck("trove-validation", "bun", ["run", "validate"]));

const freshnessCommands = ["build:skills", "build:plugins", "build:marketplace", "build:routing", "build:deps"];
const freshnessFindings: QualityFinding[] = [];
for (const script of freshnessCommands) {
  const result = run("bun", ["run", script, "--", "--dry-run"]);
  if (result.status !== 0) freshnessFindings.push({
    source: "artifact-freshness",
    severity: "error",
    rule: `${script}-stale`,
    message: result.output.trim().split("\n").slice(-5).join(" ").slice(0, 1200),
  });
}
checks.push({ id: "artifact-freshness", status: freshnessFindings.length ? "failed" : "passed", blocking: true, findings: freshnessFindings });

const structure = validateEvalStructure(ROOT, skills);
checks.push({
  id: "eval-structure",
  status: structure.errors.length ? "failed" : (skills.length ? "passed" : "skipped"),
  blocking: true,
  findings: structure.errors.map((message) => ({ source: "eval-structure", severity: "error", rule: "required-suite", message })),
});

const baselinePath = path.join(ROOT, "quality", "vally-baseline.v1.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as { schemaVersion: string; tool: string; findings: string[] };
if (baseline.schemaVersion !== "trove.vally-baseline.v1" || baseline.tool !== "@microsoft/vally-cli@0.15.0") {
  throw new Error("Vally baseline schema or tool pin is invalid");
}
let vallyFindings: QualityFinding[] = [];
if (skills.length > 0) {
  for (const skill of skills) {
    const result = run(path.join(ROOT, "node_modules", ".bin", "vally"), ["lint", canonicalSkillDirectory(skill)]);
    const parsed = parseVallyOutput(result.output);
    vallyFindings.push(...parsed);
    if (result.status !== 0 && parsed.length === 0) vallyFindings.push({
      source: "vally",
      severity: "error",
      rule: "execution-failed",
      message: result.status === null ? "Vally could not be executed" : result.output.trim().slice(-1200),
      skill,
    });
  }
  const observed = new Set(vallyFindings.map((finding) => `${finding.skill ?? ""}|${finding.rule}|${finding.message}`));
  const scopedBaseline = baseline.findings.filter((key) => skills.includes(key.split("|", 1)[0]));
  const staleBaseline = scopedBaseline.filter((key) => !observed.has(key)).map((key): QualityFinding => ({
    source: "vally",
    severity: "error",
    rule: "stale-baseline",
    message: `baseline entry no longer matches Vally output: ${key}`,
    skill: key.split("|", 1)[0],
  }));
  vallyFindings = [...applyVallyBaseline(vallyFindings, new Set(baseline.findings)), ...staleBaseline];
}
const newVallyErrors = vallyFindings.filter((finding) => finding.severity === "error");
checks.push({
  id: "vally-lint",
  status: skills.length === 0 ? "skipped" : (newVallyErrors.length ? "failed" : "passed"),
  blocking: true,
  findings: vallyFindings,
});

if (withInstall) checks.push(commandCheck("copilot-install", "bun", ["run", "test:acceptance:copilot"]));
else checks.push({ id: "copilot-install", status: "unavailable", blocking: false, findings: [] });

const validationPassed = checks.find((check) => check.id === "trove-validation")?.status === "passed";
const freshnessPassed = checks.find((check) => check.id === "artifact-freshness")?.status === "passed";
const structurePassed = checks.find((check) => check.id === "eval-structure")?.status !== "failed";
const vallyPassed = newVallyErrors.length === 0;
const installPassed = checks.find((check) => check.id === "copilot-install")?.status === "passed";
const lintDenominator = Math.max(skills.length, 1);
const lintFailedSkills = new Set(vallyFindings.map((finding) => finding.skill).filter(Boolean)).size;
const dimensions: QualityDimension[] = [
  { id: "structure-and-specification", weight: 20, status: validationPassed ? "passed" : "failed", numerator: validationPassed ? 20 : 0, denominator: 20, evidence: ["trove-validation"] },
  { id: "host-projections-and-installation", weight: 20, status: !withInstall ? "unavailable" : (freshnessPassed && installPassed ? "passed" : "failed"), numerator: !withInstall ? null : (freshnessPassed && installPassed ? 20 : 0), denominator: 20, evidence: ["artifact-freshness", "copilot-install"] },
  { id: "independent-lint-quality", weight: 15, status: skills.length === 0 ? "unavailable" : (vallyPassed ? "passed" : "failed"), numerator: skills.length === 0 ? null : Math.round(((lintDenominator - lintFailedSkills) / lintDenominator) * 150) / 10, denominator: 15, evidence: ["vally-lint"] },
  { id: "behavioral-evidence", weight: 25, status: "unavailable", numerator: null, denominator: 25, evidence: [structurePassed ? "eval structure present; model result unavailable" : "eval structure failed"] },
  { id: "documentation-routing-and-ownership", weight: 10, status: validationPassed ? "passed" : "failed", numerator: validationPassed ? 10 : 0, denominator: 10, evidence: ["trove-validation"] },
  { id: "provenance-and-supply-chain", weight: 10, status: validationPassed ? "passed" : "failed", numerator: validationPassed ? 10 : 0, denominator: 10, evidence: ["trove-validation"] },
];
const score = calculateScore(dimensions);
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", "@microsoft", "vally-cli", "package.json"), "utf8")) as { version: string };
const commit = run("git", ["rev-parse", "HEAD"]).output.trim();
const ruleFingerprint = crypto.createHash("sha256")
  .update(fs.readFileSync(baselinePath))
  .update("trove-score-v1")
  .update(JSON.stringify(dimensions.map(({ id, weight }) => ({ id, weight }))))
  .digest("hex");
const hardBlockers = checks.filter((check) => check.blocking).flatMap((check) => check.findings)
  .filter((finding) => finding.severity === "error");

const report: QualityReport = {
  schemaVersion: QUALITY_REPORT_VERSION,
  generatedAt: new Date().toISOString(),
  repository: { commit, ...(scopeKind === "changed" ? { base, head } : {}) },
  scope: { kind: scopeKind, files: [...files].sort(), skills: [...skills].sort(), plugins },
  rules: { fingerprint: ruleFingerprint, formula: "trove-score-v1", vallyBaseline: "quality/vally-baseline.v1.json" },
  tools: {
    bun: Bun.version,
    node: process.version,
    vally: packageJson.version,
    ...(withInstall ? { copilot: "1.0.69 (pinned; verified by copilot-install)" } : {}),
  },
  checks,
  hardBlockers,
  dimensions,
  score: score.score,
  coverage: score.coverage,
  trend: { status: "unavailable", reason: "no previous report", dimensionDeltas: {} },
};

const previousPath = option("previous");
if (previousPath && fs.existsSync(path.resolve(ROOT, previousPath))) {
  try {
    report.trend = compareTrend(report, readQualityReport(path.resolve(ROOT, previousPath)));
  } catch (error) {
    report.trend = { status: "incomparable", reason: (error as Error).message, dimensionDeltas: {} };
  }
}
const schemaErrors = validateQualityReport(report);
if (schemaErrors.length > 0) throw new Error(`generated invalid quality report: ${schemaErrors.join("; ")}`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const persisted = readQualityReport(outputPath);
fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
fs.writeFileSync(markdownPath, renderQualityMarkdown(persisted));
console.log(`QUALITY_RESULT=${hardBlockers.length ? "failed" : "passed"} blockers=${hardBlockers.length} warnings=${vallyFindings.filter((finding) => finding.severity === "warning").length}`);
console.log(`JSON=${path.relative(ROOT, outputPath)} MARKDOWN=${path.relative(ROOT, markdownPath)}`);
if (hardBlockers.length > 0) process.exit(1);
