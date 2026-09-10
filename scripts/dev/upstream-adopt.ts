#!/usr/bin/env bun
/**
 * One-shot helper for adopting a new upstream artifact.
 *
 * Reconstructs the transformed upstream base from a local git directory,
 * diffs it against the vendored local tree to produce `local.patch`, then
 * prints the three digests `upstream.yaml` needs. It is a development aid,
 * not part of the build: `sync:upstream --check` is what verifies the result.
 *
 *   bun run scripts/dev/upstream-adopt.ts --git-dir=<path/.git> --artifact=<id>
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { parseUpstreamManifest } from "../lib/upstream-manifest";
import { digestTree, lockEntries, patchEntries, readGitSelection, transformSelection, walkLocal, writeEntries } from "../lib/upstream-sync";

const ROOT = path.resolve(import.meta.dir, "..", "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const gitDir = option("git-dir");
const artifactId = option("artifact");
if (!gitDir || !artifactId) {
  console.error("usage: --git-dir=<path/.git> --artifact=<id>");
  process.exit(2);
}

const manifest = parseUpstreamManifest(YAML.parse(fs.readFileSync(path.join(ROOT, "upstream.yaml"), "utf-8")));
const source = manifest.sources.find((candidate) => candidate.artifacts.some((artifact) => artifact.id === artifactId));
const artifact = source?.artifacts.find((candidate) => candidate.id === artifactId);
if (!source || !artifact || artifact.status !== "active") {
  console.error(`no active artifact '${artifactId}' in upstream.yaml`);
  process.exit(1);
}

const raw = readGitSelection(path.resolve(gitDir), artifact.baseSha, artifact, manifest);
const transformed = transformSelection(raw, artifact);

// The patch is the diff between the transformed upstream base and what is
// vendored locally, which is exactly what replayPatches reapplies during a check.
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "trove-adopt-"));
const baseDir = path.join(staging, "a");
const localDir = path.join(staging, "b");
fs.mkdirSync(baseDir, { recursive: true });
writeEntries(baseDir, transformed);
fs.cpSync(path.join(ROOT, artifact.localPath), localDir, { recursive: true });
fs.rmSync(path.join(localDir, "SKILL.md"), { force: true });

const diff = spawnSync("git", ["diff", "--no-index", "--no-color", "--", "a", "b"], { cwd: staging, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
const patch = (diff.stdout ?? "").replace(/^--- a\/a\//gm, "--- a/").replace(/^\+\+\+ b\/b\//gm, "+++ b/").replace(/^diff --git a\/a\//gm, "diff --git a/").replace(/ b\/b\//g, " b/");
const patchPath = path.join(ROOT, artifact.patches[0]!);
fs.mkdirSync(path.dirname(patchPath), { recursive: true });
fs.writeFileSync(patchPath, patch);
fs.rmSync(staging, { recursive: true, force: true });

const local = lockEntries(walkLocal(path.join(ROOT, artifact.localPath)), artifact);
console.log(`artifact: ${artifact.id}`);
console.log(`base_tree_digest: ${digestTree(raw)}`);
console.log(`local_tree_digest: ${digestTree(local)}`);
console.log(`patch_digest: ${digestTree(patchEntries(ROOT, artifact))}`);
