#!/usr/bin/env bun
/**
 * Blocks hand-edited generated agentic workflows.
 *
 *   bun run scripts/validate-agentic-workflows.ts [--base=<ref> --head=<ref>]
 */

import * as path from "node:path";
import { lockFilesChangedWithoutSource, orphanLockFiles } from "./lib/agentic-workflows";
import { changedFilesFromMergeBase } from "./lib/eval-structure";

const ROOT = path.resolve(import.meta.dir, "..");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const orphans = orphanLockFiles(WORKFLOWS);
const errors = orphans.map((orphan) => `${orphan}: generated lock workflow has no .md source`);

const base = option("base") ?? process.env.QUALITY_BASE_REF;
if (base) {
  const files = changedFilesFromMergeBase(ROOT, base, option("head") ?? process.env.QUALITY_HEAD_REF ?? "HEAD");
  for (const file of lockFilesChangedWithoutSource(files)) {
    errors.push(`${file}: generated lock workflow edited without its .md source; recompile with gh aw instead`);
  }
}

for (const message of errors) console.error(`✗ ${message}`);
console.log(`AGENTIC_WORKFLOWS=${errors.length ? "failed" : "ok"} orphans=${orphans.length}`);
if (errors.length > 0) process.exit(1);
