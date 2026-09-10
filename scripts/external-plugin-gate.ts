#!/usr/bin/env bun
/**
 * External plugin quality gate.
 *
 * Runs unprivileged: no secrets, no write token, read-only repository
 * permission. Everything it clones is untrusted, so the clone is bounded by
 * policy (bytes, file count, per-file bytes, wall clock) and the optional
 * Copilot install runs against a throwaway HOME.
 *
 * Output is `trove.external-analysis.v1` JSON. The privileged writer consumes
 * that artifact and re-validates every claim in it; nothing here is trusted
 * downstream.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  listRecordFiles,
  parsePolicy,
  parseRecord,
  classifyInstallOutcome,
  inspectManifest,
  validateRecord,
  type ExternalFinding,
  type InstallStep,
  type ExternalPluginRecord,
  type ExternalPolicy,
  type IsoDate,
} from "./lib/external-plugin";
import { WRITER_ARTIFACT_SCHEMA } from "./lib/writer-provenance";

const ROOT = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const withClone = args.includes("--with-clone");
const withInstall = args.includes("--with-install");
const now = (option("now") ?? new Date().toISOString()) as IsoDate;
const policy = parsePolicy(path.join(ROOT, "external", "policy.yaml"));

interface RecordResult {
  name: string;
  file: string;
  findings: ExternalFinding[];
}

function sandboxRoot(): string {
  const base = process.env.RUNNER_TEMP ?? os.tmpdir();
  return fs.mkdtempSync(path.join(base, "trove-external-"));
}

function bounded(command: string, commandArgs: string[], cwd: string, timeoutSeconds: number): { ok: boolean; output: string } {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf-8",
    timeout: timeoutSeconds * 1000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: cwd,
      // Untrusted clone: no ambient credential of any kind reaches git or the
      // CLI, and git must never stop for an interactive prompt.
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_ASKPASS: "",
      TMPDIR: cwd,
    },
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-4000) };
}

function measureTree(dir: string, policyLimits: ExternalPolicy["sandbox"]): ExternalFinding[] {
  const findings: ExternalFinding[] = [];
  let bytes = 0;
  let files = 0;
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        const target = path.resolve(current, fs.readlinkSync(full));
        if (!target.startsWith(`${dir}${path.sep}`) && target !== dir) {
          findings.push({ rule: "clone-symlink-escape", audience: "submitter", message: `symlink escapes the clone: ${path.relative(dir, full)}` });
        }
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const size = fs.statSync(full).size;
      files += 1;
      bytes += size;
      if (size > policyLimits.maximumFileBytes) {
        findings.push({ rule: "clone-file-bytes", audience: "submitter", message: `${path.relative(dir, full)} is ${size} bytes, over the per-file limit` });
      }
    }
  };
  walk(dir);
  if (files > policyLimits.maximumFileCount) {
    findings.push({ rule: "clone-file-count", audience: "submitter", message: `clone holds ${files} files, over the ${policyLimits.maximumFileCount} limit` });
  }
  if (bytes > policyLimits.maximumCloneBytes) {
    findings.push({ rule: "clone-bytes", audience: "submitter", message: `clone is ${bytes} bytes, over the ${policyLimits.maximumCloneBytes} limit` });
  }
  return findings;
}

function cloneAndInspect(record: ExternalPluginRecord): ExternalFinding[] {
  const findings: ExternalFinding[] = [];
  const sandbox = sandboxRoot();
  try {
    const url = `https://${record.source.host}/${record.source.repository}.git`;
    const init = bounded("git", ["init", "--quiet", "clone"], sandbox, policy.sandbox.cloneTimeoutSeconds);
    if (!init.ok) return [{ rule: "clone-infrastructure", audience: "infrastructure", message: `git init failed: ${init.output}` }];
    const repo = path.join(sandbox, "clone");
    const remote = bounded("git", ["remote", "add", "origin", url], repo, policy.sandbox.cloneTimeoutSeconds);
    if (!remote.ok) return [{ rule: "clone-infrastructure", audience: "infrastructure", message: `git remote failed: ${remote.output}` }];

    // Fetch the exact reviewed SHA. A repository that cannot serve it has
    // rewritten or removed the revision the record pins, which is a submitter
    // problem, not a runner problem.
    const fetched = bounded("git", ["fetch", "--depth", "1", "origin", record.source.sha], repo, policy.sandbox.cloneTimeoutSeconds);
    if (!fetched.ok) {
      return [{
        rule: "clone-revision-unavailable",
        audience: "submitter",
        message: `could not fetch pinned revision ${record.source.sha} from ${record.source.repository}`,
      }];
    }
    const checkout = bounded("git", ["checkout", "--quiet", "FETCH_HEAD"], repo, policy.sandbox.cloneTimeoutSeconds);
    if (!checkout.ok) return [{ rule: "clone-infrastructure", audience: "infrastructure", message: `git checkout failed: ${checkout.output}` }];

    const head = bounded("git", ["rev-parse", "HEAD"], repo, policy.sandbox.cloneTimeoutSeconds);
    if (head.output.trim() !== record.source.sha) {
      findings.push({
        rule: "clone-revision-mismatch",
        audience: "submitter",
        message: `fetched ${head.output.trim()} but the record pins ${record.source.sha}`,
      });
    }

    findings.push(...measureTree(repo, policy.sandbox));

    const pluginDir = path.resolve(repo, record.source.subdirectory);
    if (!pluginDir.startsWith(repo)) {
      return [...findings, { rule: "clone-path-escape", audience: "submitter", message: `subdirectory resolves outside the clone: ${record.source.subdirectory}` }];
    }
    if (!fs.existsSync(pluginDir)) {
      return [...findings, { rule: "clone-subdirectory-missing", audience: "submitter", message: `subdirectory not found at the pinned revision: ${record.source.subdirectory}` }];
    }
    if (record.license?.evidence && !fs.existsSync(path.resolve(repo, record.license.evidence))) {
      findings.push({ rule: "license-evidence-missing", audience: "submitter", message: `license evidence not found at the pinned revision: ${record.license.evidence}` });
    }

    // Documented Copilot plugin manifest search order, highest priority first.
    const manifestPath = [".plugin/plugin.json", "plugin.json", ".github/plugin/plugin.json", ".claude-plugin/plugin.json"]
      .map((candidate) => path.join(pluginDir, candidate))
      .find((candidate) => fs.existsSync(candidate));
    if (!manifestPath) {
      return [...findings, { rule: "manifest-missing", audience: "submitter", message: "no plugin manifest found in any documented discovery path" }];
    }
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    } catch (error) {
      return [...findings, { rule: "manifest-parse", audience: "submitter", message: `manifest is not valid JSON: ${(error as Error).message}` }];
    }
    findings.push(...inspectManifest(manifest, record, policy));

    if (withInstall) findings.push(...installSmoke(record, pluginDir, sandbox));
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
  return findings;
}

function installSmoke(record: ExternalPluginRecord, pluginDir: string, sandbox: string): ExternalFinding[] {
  const copilot = process.env.COPILOT_BIN ?? "copilot";
  const marketRoot = path.join(sandbox, "market");
  fs.mkdirSync(path.join(marketRoot, ".github", "plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(marketRoot, ".github", "plugin", "marketplace.json"),
    `${JSON.stringify({
      name: "trove-external-review",
      owner: { name: "Trove external review" },
      plugins: [{ name: record.name, source: path.relative(marketRoot, pluginDir), description: record.description }],
    }, null, 2)}\n`,
  );
  const run = (commandArgs: string[]): { ok: boolean; output: string } =>
    bounded(copilot, commandArgs, marketRoot, policy.sandbox.installTimeoutSeconds);

  const steps: InstallStep[] = [];
  const added = run(["plugin", "marketplace", "add", marketRoot]);
  steps.push({ step: "marketplace-add", ...added });
  if (added.ok) {
    const installed = run(["plugin", "install", `${record.name}@trove-external-review`]);
    steps.push({ step: "install", ...installed });
    if (installed.ok) steps.push({ step: "list", ...run(["plugin", "list"]) });
  }
  return classifyInstallOutcome(steps, record.name);
}

const only = option("record");
const files = listRecordFiles(ROOT).filter((file) => !only || path.basename(file) === `${only}.yaml`);
const results: RecordResult[] = [];

for (const file of files) {
  const fileName = path.basename(file);
  const { record, findings } = parseRecord(file);
  if (!record) {
    results.push({ name: fileName.replace(/\.yaml$/, ""), file: path.relative(ROOT, file), findings });
    continue;
  }
  const recordFindings = [...findings, ...validateRecord(record, policy, { fileName, now })];
  const blockedBySchema = recordFindings.some((finding) => finding.audience === "submitter");
  if (withClone && !blockedBySchema && record.review.disposition !== "removed" && record.review.disposition !== "rejected") {
    recordFindings.push(...cloneAndInspect(record));
  }
  results.push({ name: record.name ?? fileName, file: path.relative(ROOT, file), findings: recordFindings });
}

const all = results.flatMap((result) => result.findings.map((finding) => ({ ...finding, record: result.name })));
const submitterFindings = all.filter((finding) => finding.audience === "submitter");
const maintainerFindings = all.filter((finding) => finding.audience === "maintainer");
const infrastructureFindings = all.filter((finding) => finding.audience === "infrastructure");

const artifact = {
  schemaVersion: WRITER_ARTIFACT_SCHEMA,
  pullRequest: Number(option("pull-request") ?? process.env.PR_NUMBER ?? 0),
  headRepository: option("head-repository") ?? process.env.PR_HEAD_REPOSITORY ?? "",
  headRef: option("head-ref") ?? process.env.PR_HEAD_REF ?? "",
  headSha: option("head-sha") ?? process.env.PR_HEAD_SHA ?? "",
  baseSha: option("base-sha") ?? process.env.PR_BASE_SHA ?? "",
  generatedAt: now,
  records: results,
  findings: all,
};

const output = path.resolve(ROOT, option("output") ?? "external-analysis.v1.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);

for (const finding of all) console.log(`${finding.audience}\t${finding.record}\t${finding.rule}\t${finding.message}`);
console.log(
  `EXTERNAL_RESULT=${submitterFindings.length || maintainerFindings.length ? "failed" : infrastructureFindings.length ? "infrastructure" : "passed"}` +
  ` records=${results.length} submitter=${submitterFindings.length} maintainer=${maintainerFindings.length} infrastructure=${infrastructureFindings.length}`,
);

// Infrastructure failures exit 75 (EX_TEMPFAIL) so a runner or network problem
// is never reported to a submitter as "your plugin is broken".
if (submitterFindings.length > 0 || maintainerFindings.length > 0) process.exit(1);
if (infrastructureFindings.length > 0) process.exit(75);
