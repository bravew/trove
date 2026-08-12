/**
 * Read-only health checks for `trove doctor`.
 *
 * Each check is a pure-ish function — it reads the workspace and returns a
 * structured result. No side effects. Tests construct an isolated
 * fixture root and assert per-check outcomes.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { configPath, readConfig, troveHome } from "./trove-home";

export type CheckSeverity = "ok" | "warn" | "error";

export interface CheckResult {
  name: string;
  severity: CheckSeverity;
  message: string;
}

export interface DoctorResult {
  checks: CheckResult[];
  errors: number;
  warnings: number;
}

function ok(name: string, message: string): CheckResult {
  return { name, severity: "ok", message };
}
function warn(name: string, message: string): CheckResult {
  return { name, severity: "warn", message };
}
function err(name: string, message: string): CheckResult {
  return { name, severity: "error", message };
}

// ─── Individual checks (exported for direct testing) ────────

export function checkBunToolchain(): CheckResult {
  try {
    const v = execSync("bun --version", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return ok("bun toolchain", `bun ${v}`);
  } catch {
    return err("bun toolchain", "bun is not on PATH (install: https://bun.sh)");
  }
}

export function checkWorkspaceRoot(workspace: string): CheckResult {
  const pkg = fs.existsSync(path.join(workspace, "package.json"));
  const market = fs.existsSync(path.join(workspace, "marketplace.yaml"));
  if (pkg && market) return ok("workspace root", `package.json + marketplace.yaml present`);
  if (!pkg) return err("workspace root", `missing package.json at ${workspace}`);
  return err("workspace root", `missing marketplace.yaml at ${workspace}`);
}

export function checkVersionFile(workspace: string): CheckResult {
  const versionPath = path.join(workspace, "VERSION");
  if (!fs.existsSync(versionPath)) return err("VERSION", "VERSION file missing");
  const v = fs.readFileSync(versionPath, "utf-8").trim();
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(v)) {
    return err("VERSION", `'${v}' is not a recognized version shape`);
  }
  return ok("VERSION", v);
}

export function checkGeneratedOutputs(workspace: string): CheckResult {
  const expected = ["catalog.json", "deps.json", "docs/routing.md"];
  const missing: string[] = [];
  const empty: string[] = [];
  for (const rel of expected) {
    const full = path.join(workspace, rel);
    if (!fs.existsSync(full)) missing.push(rel);
    else if (fs.statSync(full).size === 0) empty.push(rel);
  }
  if (missing.length === 0 && empty.length === 0) {
    return ok("generated outputs", `${expected.join(", ")} present and non-empty`);
  }
  if (missing.length > 0) {
    return warn("generated outputs", `missing: ${missing.join(", ")} — run \`bun run build\``);
  }
  return warn("generated outputs", `empty: ${empty.join(", ")} — re-run \`bun run build\``);
}

export function checkHostOutputs(workspace: string, hosts: string[]): CheckResult {
  if (hosts.length === 0) return ok("host outputs", "(no hosts configured)");
  const missing: string[] = [];
  for (const h of hosts) {
    if (h === "claude") {
      // Claude emits in-place under skills/ rather than output/.
      continue;
    }
    const dir = path.join(workspace, "output", h);
    if (!fs.existsSync(dir)) missing.push(h);
  }
  if (missing.length === 0) return ok("host outputs", `present for ${hosts.join(", ")}`);
  return warn("host outputs", `output/ missing for: ${missing.join(", ")} — run \`bun run build\``);
}

export function checkConfigReadability(home: string = troveHome()): CheckResult {
  const cfg = configPath(home);
  if (!fs.existsSync(cfg)) {
    return ok("config", "no config file (defaults in effect)");
  }
  try {
    readConfig(home);
    return ok("config", `${cfg} parses cleanly`);
  } catch (e) {
    return err("config", `${cfg} is not valid YAML: ${(e as Error).message}`);
  }
}

export function checkLearningsStore(home: string = troveHome()): CheckResult {
  const projectsDir = path.join(home, "projects");
  if (!fs.existsSync(projectsDir)) return ok("learnings store", "no learnings logged yet");
  let projectCount = 0;
  let entryCount = 0;
  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(projectsDir, entry.name, "learnings.jsonl");
    if (!fs.existsSync(file)) continue;
    projectCount++;
    entryCount += fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).length;
  }
  return ok("learnings store", `${entryCount} entries across ${projectCount} project(s)`);
}

export function checkInstallConsistency(workspace: string): CheckResult {
  const hasGit = fs.existsSync(path.join(workspace, ".git"));
  const hasVersion = fs.existsSync(path.join(workspace, "VERSION"));
  if (hasGit && hasVersion) return ok("install", "git-backed install");
  if (!hasGit && hasVersion) return warn("install", "vendored install (no .git) — upgrades go through parent project");
  if (hasGit && !hasVersion) return warn("install", "git checkout but no VERSION file — likely a partial clone");
  return err("install", "neither .git nor VERSION present — install state is unclear");
}

// ─── Aggregator ─────────────────────────────────────────────

export function runDoctor(workspace: string, home: string = troveHome()): DoctorResult {
  const cfg = (() => {
    try {
      return readConfig(home);
    } catch {
      return null;
    }
  })();
  const hosts = cfg?.hosts ?? [];

  const checks: CheckResult[] = [
    checkBunToolchain(),
    checkWorkspaceRoot(workspace),
    checkVersionFile(workspace),
    checkInstallConsistency(workspace),
    checkGeneratedOutputs(workspace),
    checkHostOutputs(workspace, hosts),
    checkConfigReadability(home),
    checkLearningsStore(home),
  ];

  const errors = checks.filter((c) => c.severity === "error").length;
  const warnings = checks.filter((c) => c.severity === "warn").length;
  return { checks, errors, warnings };
}
