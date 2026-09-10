#!/usr/bin/env bun
/**
 * Intake front door for external plugin issues.
 *
 * Runs unprivileged with no secrets. It reads an issue body from a file,
 * extracts the fenced record, validates it against policy, and writes the
 * normalized record plus findings for a maintainer to review. It never
 * commits: a record enters the repository through a reviewed pull request.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  extractIssueRecord,
  parsePolicy,
  parseRecordText,
  serializeRecord,
  validateRecord,
  type ExternalFinding,
  type IsoDate,
} from "./lib/external-plugin";

const ROOT = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const now = (option("now") ?? new Date().toISOString()) as IsoDate;
const policy = parsePolicy(path.join(ROOT, "external", "policy.yaml"));

const bodyFile = option("body-file");
if (!bodyFile) {
  console.error("usage: --body-file=<path> [--output=<path>] [--markdown=<path>]");
  process.exit(2);
}

const body = fs.readFileSync(path.resolve(ROOT, bodyFile), "utf-8");
const extracted = extractIssueRecord(body);
let findings: ExternalFinding[] = [...extracted.findings];
let normalized: string | null = null;
let name: string | null = null;

if (extracted.yaml) {
  const parsed = parseRecordText(extracted.yaml);
  findings = [...findings, ...parsed.findings];
  if (parsed.record) {
    name = typeof parsed.record.name === "string" ? parsed.record.name : null;
    findings = [
      ...findings,
      ...validateRecord(parsed.record, policy, { fileName: `${name ?? "unnamed"}.yaml`, now }),
    ];
    // A submission always arrives as `proposed`. A submitter cannot self-certify
    // a reviewer, a revision, or a review date.
    if (findings.length === 0) {
      normalized = serializeRecord({
        ...parsed.record,
        review: { disposition: "proposed", reviewer: null, revision: null, reviewedAt: null, nextReviewAt: null, note: null },
      });
    }
  }
}

const output = option("output");
if (output) {
  fs.writeFileSync(path.resolve(ROOT, output), `${JSON.stringify({
    schemaVersion: "trove.external-intake.v1",
    generatedAt: now,
    name,
    findings,
    normalized,
  }, null, 2)}\n`);
}

const markdown = option("markdown");
if (markdown) {
  const lines = ["# External plugin intake", ""];
  if (findings.length === 0 && normalized && name) {
    lines.push(
      `Record validates against policy. Open a pull request adding it as \`external/plugins/${name}.yaml\`:`,
      "",
      "```yaml",
      normalized.trimEnd(),
      "```",
      "",
      "A maintainer approves it with the review command after the pull request gate passes.",
    );
  } else {
    lines.push("This submission cannot be accepted yet.", "");
    for (const finding of findings) lines.push(`- **${finding.audience} / ${finding.rule}**: ${finding.message}`);
  }
  fs.writeFileSync(path.resolve(ROOT, markdown), `${lines.join("\n")}\n`);
}

for (const finding of findings) console.log(`${finding.audience}\t${finding.rule}\t${finding.message}`);
console.log(`INTAKE_RESULT=${findings.length === 0 ? "accepted" : "rejected"} findings=${findings.length}`);
if (findings.some((finding) => finding.audience === "infrastructure")) process.exit(75);
if (findings.length > 0) process.exit(1);
