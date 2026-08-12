#!/usr/bin/env bun
/**
 * Promote canary branch to stable.
 * Run after 48-hour soak period.
 *
 * Usage:
 *   bun run promote-stable
 */

import { execSync } from "child_process";

function run(cmd: string): string {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

try {
  const currentBranch = run("git branch --show-current");

  if (currentBranch !== "main" && currentBranch !== "canary") {
    console.error(`Must be on 'main' or 'canary' branch. Currently on '${currentBranch}'.`);
    process.exit(1);
  }

  // Ensure working directory is clean
  const status = run("git status --porcelain");
  if (status) {
    console.error("Working directory is not clean. Commit or stash changes first.");
    process.exit(1);
  }

  // Update stable branch
  run("git fetch origin");
  run("git checkout stable 2>/dev/null || git checkout -b stable");
  run("git reset --hard origin/canary");
  run("git push origin stable");

  // Return to original branch
  run(`git checkout ${currentBranch}`);

  console.log("\n✓ Canary promoted to stable.");
  console.log("  Users on trove-stable will receive the update on next sync.");
} catch (e) {
  console.error(`\nPromotion failed: ${(e as Error).message}`);
  process.exit(1);
}
