/**
 * P4 — Persistent state tests.
 *
 * Each test creates an isolated `TROVE_HOME` under os.tmpdir() so the
 * real `~/.trove` is never touched. Where the tests exercise the CLI,
 * they spawn `./bin/trove` as a subprocess with `TROVE_HOME` set in
 * the environment.
 */

import { test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import {
  defaultConfig,
  readConfig,
  writeConfig,
  setConfigKey,
  configPath,
  slugFromRemote,
  normalizeLearning,
  appendLearning,
  readLearnings,
  searchLearnings,
} from "../scripts/lib/trove-home";
import {
  checkBunToolchain,
  checkVersionFile,
  checkWorkspaceRoot,
  checkInstallConsistency,
  checkConfigReadability,
  checkLearningsStore,
  runDoctor,
} from "../scripts/lib/doctor";

const ROOT = path.resolve(import.meta.dir, "..");

let TMP_HOME: string;

beforeEach(() => {
  TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "p4-state-"));
});
afterEach(() => {
  fs.rmSync(TMP_HOME, { recursive: true, force: true });
});

// ─── Config ────────────────────────────────────────────────

test("config: defaults are returned when no file exists", () => {
  const cfg = readConfig(TMP_HOME);
  expect(cfg).toEqual(defaultConfig());
});

test("config: write/read roundtrip preserves values", () => {
  const updated = { ...defaultConfig(), auto_upgrade: true, learnings_max_results: 7 };
  writeConfig(updated, TMP_HOME);
  expect(readConfig(TMP_HOME)).toEqual(updated);
});

test("config: setConfigKey coerces booleans across common forms", () => {
  for (const v of ["true", "1", "yes", "on"]) {
    setConfigKey("auto_upgrade", v, TMP_HOME);
    expect(readConfig(TMP_HOME).auto_upgrade).toBe(true);
  }
  for (const v of ["false", "0", "no", "off"]) {
    setConfigKey("auto_upgrade", v, TMP_HOME);
    expect(readConfig(TMP_HOME).auto_upgrade).toBe(false);
  }
});

test("config: setConfigKey rejects junk booleans with a clear error", () => {
  expect(() => setConfigKey("auto_upgrade", "maybe", TMP_HOME)).toThrow("must be a boolean");
});

test("config: setConfigKey('hosts', csv) parses comma-separated lists", () => {
  setConfigKey("hosts", "claude, cursor, codex", TMP_HOME);
  expect(readConfig(TMP_HOME).hosts).toEqual(["claude", "cursor", "codex"]);
});

test("config: setConfigKey rejects unknown keys", () => {
  expect(() => setConfigKey("nonsense", "x", TMP_HOME)).toThrow("Unknown config key");
});

test("config: setConfigKey rejects bad detail_level", () => {
  expect(() => setConfigKey("detail_level", "verbose", TMP_HOME)).toThrow("'detail_level'");
});

test("config: malformed YAML is still tolerated where reasonable", () => {
  // We treat the file as untrusted; non-object payloads collapse to defaults.
  fs.mkdirSync(TMP_HOME, { recursive: true });
  fs.writeFileSync(configPath(TMP_HOME), "[1, 2, 3]\n");
  // Array YAML doesn't match TroveConfig shape — readConfig should
  // ignore the partial and return defaults.
  const cfg = readConfig(TMP_HOME);
  expect(cfg).toEqual(defaultConfig());
});

// ─── Slug derivation ───────────────────────────────────────

test("slug: ssh remote → owner-repo", () => {
  expect(slugFromRemote("git@github.com:bravew/trove.git", "fallback")).toBe(
    "bravew-trove",
  );
});

test("slug: https remote → owner-repo", () => {
  expect(slugFromRemote("https://github.com/bravew/trove.git", "fallback")).toBe(
    "bravew-trove",
  );
});

test("slug: no remote falls back to dir name", () => {
  expect(slugFromRemote(null, "myapp")).toBe("myapp");
});

test("slug: sanitization strips unsafe chars and consecutive hyphens", () => {
  expect(slugFromRemote(null, "My App!! v2.0")).toBe("my-app-v2-0");
});

test("slug: empty fallback yields a stable placeholder", () => {
  expect(slugFromRemote(null, "")).toBe("project");
});

// ─── Learnings ─────────────────────────────────────────────

test("learnings: normalize sets ts when omitted", () => {
  const entry = normalizeLearning({
    skill: "trove-review",
    type: "pattern",
    key: "k",
    insight: "i",
    confidence: 3,
  });
  expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("learnings: normalize rejects invalid type", () => {
  expect(() =>
    normalizeLearning({
      skill: "trove-review",
      type: "garbage" as unknown as string,
      key: "k",
      insight: "i",
      confidence: 3,
    }),
  ).toThrow("learning.type");
});

test("learnings: normalize rejects out-of-range confidence", () => {
  for (const c of [0, 6, 1.5, NaN]) {
    expect(() =>
      normalizeLearning({
        skill: "x",
        type: "pattern",
        key: "k",
        insight: "i",
        confidence: c as number,
      }),
    ).toThrow("learning.confidence");
  }
});

test("learnings: append + read roundtrip", () => {
  const entry = normalizeLearning({
    skill: "trove-review",
    type: "pattern",
    key: "k1",
    insight: "first",
    confidence: 4,
  });
  appendLearning("test-slug", entry, TMP_HOME);
  expect(readLearnings("test-slug", TMP_HOME)).toEqual([entry]);
});

test("learnings: search filters by skill, type, query and respects limit", () => {
  const slug = "test-slug";
  const ts = (n: number) => `2026-04-${String(n).padStart(2, "0")}T00:00:00Z`;
  appendLearning(slug, normalizeLearning({ ts: ts(1), skill: "trove-review", type: "pattern", key: "a", insight: "ruff is required", confidence: 4 }), TMP_HOME);
  appendLearning(slug, normalizeLearning({ ts: ts(2), skill: "trove-spec", type: "pattern", key: "b", insight: "specs need stories", confidence: 3 }), TMP_HOME);
  appendLearning(slug, normalizeLearning({ ts: ts(3), skill: "trove-review", type: "pitfall", key: "c", insight: "do not skip ruff", confidence: 5 }), TMP_HOME);

  // Filter by skill
  const reviewOnly = searchLearnings(slug, { skill: "trove-review" }, TMP_HOME);
  expect(reviewOnly.map((e) => e.key)).toEqual(["c", "a"]); // newest-first

  // Filter by type
  const pitfalls = searchLearnings(slug, { type: "pitfall" }, TMP_HOME);
  expect(pitfalls.map((e) => e.key)).toEqual(["c"]);

  // Substring on insight
  const ruffMentions = searchLearnings(slug, { query: "ruff" }, TMP_HOME);
  expect(ruffMentions.map((e) => e.key)).toEqual(["c", "a"]);

  // Limit cap
  const limited = searchLearnings(slug, { limit: 1 }, TMP_HOME);
  expect(limited.length).toBe(1);
  expect(limited[0].key).toBe("c");
});

test("learnings: malformed lines in the JSONL are skipped, not fatal", () => {
  const slug = "test-slug";
  fs.mkdirSync(path.join(TMP_HOME, "projects", slug), { recursive: true });
  fs.writeFileSync(
    path.join(TMP_HOME, "projects", slug, "learnings.jsonl"),
    `not-json\n${JSON.stringify({ ts: "2026-01-01T00:00:00Z", skill: "x", type: "pattern", key: "k", insight: "i", confidence: 3 })}\n`,
  );
  const entries = readLearnings(slug, TMP_HOME);
  expect(entries.length).toBe(1);
  expect(entries[0].key).toBe("k");
});

// ─── Doctor ────────────────────────────────────────────────

test("doctor: checkBunToolchain reports OK in this environment", () => {
  // The test runner is bun, so `bun --version` must succeed.
  expect(checkBunToolchain().severity).toBe("ok");
});

test("doctor: checkWorkspaceRoot returns ok for the real workspace", () => {
  expect(checkWorkspaceRoot(ROOT).severity).toBe("ok");
});

test("doctor: checkVersionFile parses semver", () => {
  expect(checkVersionFile(ROOT).severity).toBe("ok");
});

test("doctor: checkInstallConsistency identifies a git-backed install", () => {
  const r = checkInstallConsistency(ROOT);
  expect(r.severity).toBe("ok");
  expect(r.message).toContain("git-backed");
});

test("doctor: checkInstallConsistency flags vendored install (VERSION but no .git)", () => {
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p4-vendored-"));
  try {
    fs.writeFileSync(path.join(fakeRoot, "VERSION"), "1.0.0\n");
    const r = checkInstallConsistency(fakeRoot);
    expect(r.severity).toBe("warn");
    expect(r.message).toContain("vendored");
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("doctor: checkInstallConsistency flags unclear state when neither marker exists", () => {
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p4-unclear-"));
  try {
    const r = checkInstallConsistency(fakeRoot);
    expect(r.severity).toBe("error");
    expect(r.message).toContain("unclear");
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("doctor: checkConfigReadability tolerates missing file", () => {
  expect(checkConfigReadability(TMP_HOME).severity).toBe("ok");
});

test("doctor: checkLearningsStore counts entries across projects", () => {
  fs.mkdirSync(path.join(TMP_HOME, "projects", "p1"), { recursive: true });
  fs.mkdirSync(path.join(TMP_HOME, "projects", "p2"), { recursive: true });
  fs.writeFileSync(path.join(TMP_HOME, "projects", "p1", "learnings.jsonl"), `{"x":1}\n{"x":2}\n`);
  fs.writeFileSync(path.join(TMP_HOME, "projects", "p2", "learnings.jsonl"), `{"x":1}\n`);
  const r = checkLearningsStore(TMP_HOME);
  expect(r.severity).toBe("ok");
  expect(r.message).toContain("3 entries across 2 project(s)");
});

test("doctor: runDoctor aggregates and counts severities", () => {
  // Build a minimal fixture workspace that fails some checks.
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p4-doctor-"));
  try {
    // Missing package.json + marketplace.yaml + VERSION + .git → multiple errors.
    const result = runDoctor(fakeRoot, TMP_HOME);
    expect(result.errors).toBeGreaterThan(0);
    // Workspace and VERSION checks fail; others are still well-formed.
    const errorNames = result.checks.filter((c) => c.severity === "error").map((c) => c.name);
    expect(errorNames).toContain("workspace root");
    expect(errorNames).toContain("VERSION");
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  }
});

// ─── CLI integration ──────────────────────────────────────

function runCli(args: string[], env: Record<string, string> = {}) {
  return spawnSync("./bin/trove", args, {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
}

test("cli: `trove config list` prints all default keys", () => {
  const r = runCli(["config", "list"], { TROVE_HOME: TMP_HOME });
  expect(r.status).toBe(0);
  const out = r.stdout.toString();
  for (const k of Object.keys(defaultConfig())) expect(out).toContain(k);
});

test("cli: `trove config get <unknown>` exits with error", () => {
  const r = runCli(["config", "get", "nonsense"], { TROVE_HOME: TMP_HOME });
  expect(r.status).not.toBe(0);
});

test("cli: `trove config set` then `get` roundtrip", () => {
  const setResult = runCli(["config", "set", "auto_upgrade", "true"], { TROVE_HOME: TMP_HOME });
  expect(setResult.status).toBe(0);
  const getResult = runCli(["config", "get", "auto_upgrade"], { TROVE_HOME: TMP_HOME });
  expect(getResult.status).toBe(0);
  expect(getResult.stdout.toString().trim()).toBe("true");
});

test("cli: `trove learnings search` short-circuits when learnings_enabled is false", () => {
  runCli(["config", "set", "learnings_enabled", "false"], { TROVE_HOME: TMP_HOME });
  const r = runCli(["learnings", "search"], { TROVE_HOME: TMP_HOME });
  expect(r.status).toBe(0);
  expect(r.stdout.toString()).toContain("learnings_enabled is false");
});

test("cli: `trove doctor` exits 0 on the real workspace", () => {
  const r = runCli(["doctor"], { TROVE_HOME: TMP_HOME });
  expect(r.status).toBe(0);
  expect(r.stdout.toString()).toContain("All checks passed");
});

test("cli: `trove upgrade --check` reports git status without mutating", () => {
  const r = runCli(["upgrade", "--check"], { TROVE_HOME: TMP_HOME });
  const out = r.stdout.toString();
  expect(out).toContain("check mode");
  // --check should always reach the git status query, not bail early.
  expect(out).toMatch(/local HEAD:|remote HEAD:|status:/);
});

test(
  "cli: `trove upgrade --check` is not blocked by snooze",
  () => {
    // Regression: --check used to exit at the snooze gate before showing
    // git status. The snooze guard only protects against unintended
    // mutation; --check is read-only and must always report.
    fs.mkdirSync(TMP_HOME, { recursive: true });
    fs.writeFileSync(path.join(TMP_HOME, "update-snoozed"), "");
    const r = runCli(["upgrade", "--check"], { TROVE_HOME: TMP_HOME });
    const out = r.stdout.toString();
    // We entered the --check path…
    expect(out).toContain("check mode");
    // …and the snooze gate did NOT short-circuit it.
    expect(out).not.toContain("upgrade snoozed");
  },
  // --check runs `git ls-remote origin HEAD` which hits the network and
  // can be slow on flaky links. 15s gives it room without making the
  // suite feel sluggish.
  15000,
);
