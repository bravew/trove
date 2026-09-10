#!/usr/bin/env bun
/**
 * External plugin review state machine.
 *
 * Maintainer commands and the scheduled six-month re-review both run through
 * this script so every transition is one reviewed code path with fixtures,
 * rather than conditionals spread across workflow YAML.
 *
 *   bun run scripts/external-plugin-review.ts --command=approve --record=<name> --actor=<login>
 *   bun run scripts/external-plugin-review.ts --due --output=due.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  applyCommand,
  isReviewStale,
  listRecordFiles,
  parsePolicy,
  parseRecord,
  serializeRecord,
  validateRecord,
  type ExternalFinding,
  type IsoDate,
  type ReviewCommand,
} from "./lib/external-plugin";

const ROOT = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const now = (option("now") ?? new Date().toISOString()) as IsoDate;
const policy = parsePolicy(path.join(ROOT, "external", "policy.yaml"));

function fail(findings: ExternalFinding[]): never {
  for (const finding of findings) console.error(`${finding.audience}\t${finding.rule}\t${finding.message}`);
  process.exit(findings.some((finding) => finding.audience === "infrastructure") ? 75 : 1);
}

if (args.includes("--due")) {
  const due = [];
  for (const file of listRecordFiles(ROOT)) {
    const { record } = parseRecord(file);
    if (!record || !isReviewStale(record, now)) continue;
    due.push({
      name: record.name,
      file: path.relative(ROOT, file),
      revision: record.review.revision,
      reviewedAt: record.review.reviewedAt,
      nextReviewAt: record.review.nextReviewAt,
    });
  }
  const output = option("output");
  const payload = { schemaVersion: "trove.external-rereview.v1", generatedAt: now, due };
  if (output) fs.writeFileSync(path.resolve(ROOT, output), `${JSON.stringify(payload, null, 2)}\n`);
  for (const item of due) console.log(`due\t${item.name}\t${item.nextReviewAt}`);
  console.log(`REREVIEW_DUE=${due.length}`);
  process.exit(0);
}

const command = option("command") as ReviewCommand | undefined;
const name = option("record");
const actor = option("actor");
if (!command || !name || !actor) {
  console.error("usage: --command=<approve|needs-changes|reject|keep|remove> --record=<name> --actor=<login>");
  process.exit(2);
}

const file = path.join(ROOT, "external", "plugins", `${name}.yaml`);
if (!fs.existsSync(file)) fail([{ rule: "record-missing", audience: "maintainer", message: `no external plugin record named '${name}'` }]);

const { record, findings } = parseRecord(file);
if (!record) fail(findings);

const outcome = applyCommand(record, command, actor, now, policy);
if (!outcome.record) fail(outcome.findings);

// Re-validate the transitioned record before writing. A command must never be
// able to produce a record the intake gate would then reject.
const postFindings = validateRecord(outcome.record, policy, { fileName: `${name}.yaml`, now });
if (postFindings.length > 0) fail(postFindings);

const serialized = serializeRecord(outcome.record);
const unchanged = fs.readFileSync(file, "utf-8") === serialized;
fs.writeFileSync(file, serialized);
console.log(`EXTERNAL_REVIEW=${command} record=${name} disposition=${outcome.record.review.disposition} changed=${unchanged ? "no" : "yes"}`);
