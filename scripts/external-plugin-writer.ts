#!/usr/bin/env bun
/**
 * Privileged comment writer for external plugin analysis.
 *
 * Runs from `workflow_run` with trusted default-branch code. It never checks
 * out or executes pull-request content. Every claim in the analyzer artifact
 * is re-derived from the GitHub API and compared before anything is written.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  COMMENT_MARKER,
  renderWriterComment,
  validateWriterInput,
  type LivePullRequest,
  type WorkflowRunContext,
} from "./lib/writer-provenance";

const ROOT = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const artifactPath = option("artifact");
const runPath = option("run");
const repository = option("repository") ?? process.env.GITHUB_REPOSITORY ?? "";
if (!artifactPath || !runPath || !repository) {
  console.error("usage: --artifact=<json> --run=<json> [--repository=owner/name]");
  process.exit(2);
}

const MAXIMUM_ARTIFACT_BYTES = 262144;
const artifactBytes = fs.statSync(path.resolve(ROOT, artifactPath)).size;
let artifact: unknown = null;
try {
  artifact = JSON.parse(fs.readFileSync(path.resolve(ROOT, artifactPath), "utf-8")) as unknown;
} catch (error) {
  console.error(`refusing to write: artifact is not valid JSON: ${(error as Error).message}`);
  process.exit(1);
}
const run = JSON.parse(fs.readFileSync(path.resolve(ROOT, runPath), "utf-8")) as WorkflowRunContext;

function gh(commandArgs: string[]): { ok: boolean; output: string } {
  const result = spawnSync("gh", commandArgs, { cwd: ROOT, encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

const claimedNumber = (artifact as { pullRequest?: unknown })?.pullRequest;
let live: LivePullRequest | null = null;
if (Number.isInteger(claimedNumber) && (claimedNumber as number) > 0) {
  const view = gh(["pr", "view", String(claimedNumber), "--repo", repository, "--json", "number,state,headRefName,headRefOid,baseRefOid,headRepositoryOwner,headRepository"]);
  if (view.ok) {
    const parsed = JSON.parse(view.output) as {
      number: number;
      state: string;
      headRefName: string;
      headRefOid: string;
      baseRefOid: string;
      headRepositoryOwner: { login: string };
      headRepository: { name: string };
    };
    live = {
      number: parsed.number,
      state: parsed.state === "OPEN" ? "open" : "closed",
      headRepository: `${parsed.headRepositoryOwner.login}/${parsed.headRepository.name}`,
      headRef: parsed.headRefName,
      headSha: parsed.headRefOid,
      baseSha: parsed.baseRefOid,
    };
  }
}

const rejections = validateWriterInput(artifact, artifactBytes, run, live, {
  workflowPath: ".github/workflows/external-plugin-pr-quality-gates.yml",
  maximumArtifactBytes: MAXIMUM_ARTIFACT_BYTES,
  baseRepository: repository,
});

if (rejections.length > 0) {
  console.error("refusing to write; artifact provenance rejected:");
  for (const rejection of rejections) console.error(`- ${rejection}`);
  process.exit(1);
}

const findings = (artifact as { findings: Array<{ audience: string; record?: string; rule: string; message: string }> }).findings;
const lines = findings.length === 0
  ? ["External plugin gate passed. No findings."]
  : [
      "External plugin gate findings:",
      "",
      ...findings.map((finding) => `- **${finding.audience} / ${finding.record ?? "record"} / ${finding.rule}**: ${finding.message}`),
      "",
      "`infrastructure` findings are ours to fix and are not a request for changes.",
    ];
const body = renderWriterComment(lines.join("\n"));

const existing = gh(["api", `repos/${repository}/issues/${live!.number}/comments`, "--paginate", "--jq",
  `[.[] | select(.body | startswith("${COMMENT_MARKER}")) | .id] | first // empty`]);
const commentId = existing.ok ? existing.output.trim() : "";

const bodyFile = path.join(process.env.RUNNER_TEMP ?? ".", "external-comment.md");
fs.writeFileSync(bodyFile, body);
const written = commentId
  ? gh(["api", "--method", "PATCH", `repos/${repository}/issues/comments/${commentId}`, "-F", `body=@${bodyFile}`])
  : gh(["api", "--method", "POST", `repos/${repository}/issues/${live!.number}/comments`, "-F", `body=@${bodyFile}`]);
if (!written.ok) {
  console.error(`comment write failed: ${written.output}`);
  process.exit(1);
}
console.log(`WRITER_RESULT=${commentId ? "updated" : "created"} pr=${live!.number}`);
