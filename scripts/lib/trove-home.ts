/**
 * `~/.trove/` state-directory helpers.
 *
 * Everything that touches user state — config, learnings, snooze flags —
 * goes through this module so the home directory can be redirected via
 * `TROVE_HOME` for tests and ephemeral environments. No CLI surface
 * here; `bin/trove` and friends compose these primitives.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import YAML from "yaml";

// ─── Home + project paths ───────────────────────────────────

/**
 * Resolve the Trove state-home directory.
 *
 *   TROVE_HOME (env override)  →  ~/.trove  (default)
 *
 * The env override is the only knob; it exists for tests, sandboxed CI,
 * and users on systems where `~` is read-only.
 */
export function troveHome(): string {
  const override = process.env.TROVE_HOME;
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(os.homedir(), ".trove");
}

export function configPath(home: string = troveHome()): string {
  return path.join(home, "config.yaml");
}

export function snoozePath(home: string = troveHome()): string {
  return path.join(home, "update-snoozed");
}

export function projectsRoot(home: string = troveHome()): string {
  return path.join(home, "projects");
}

export function learningsPath(slug: string, home: string = troveHome()): string {
  return path.join(projectsRoot(home), slug, "learnings.jsonl");
}

// ─── Config ─────────────────────────────────────────────────

export interface TroveConfig {
  /** Hosts setup will install to when `--host` is not specified. */
  hosts: string[];
  /** When true, `trove upgrade` runs without confirmation. */
  auto_upgrade: boolean;
  /** When true, the umbrella CLI nudges about new versions. */
  update_check: boolean;
  /** When true, skills may consume project learnings. */
  learnings_enabled: boolean;
  /** Cap on results returned by `trove learnings search`. */
  learnings_max_results: number;
  /** Display preference. */
  detail_level: "normal" | "terse";
}

export function defaultConfig(): TroveConfig {
  return {
    hosts: ["claude", "cursor"],
    auto_upgrade: false,
    update_check: true,
    learnings_enabled: true,
    learnings_max_results: 3,
    detail_level: "normal",
  };
}

/**
 * Read the config file, layering user-set keys onto the defaults. Missing
 * file is non-fatal — returns defaults. Parse errors throw so callers can
 * decide whether to surface or recover.
 */
export function readConfig(home: string = troveHome()): TroveConfig {
  const cfgPath = configPath(home);
  const defaults = defaultConfig();
  if (!fs.existsSync(cfgPath)) return defaults;

  const raw = fs.readFileSync(cfgPath, "utf-8");
  const parsed = (YAML.parse(raw) as Partial<TroveConfig> | null) ?? {};

  // Coerce types defensively. We treat the file as untrusted user input
  // because hand-editing is encouraged.
  const merged: TroveConfig = { ...defaults };
  if (Array.isArray(parsed.hosts)) {
    merged.hosts = parsed.hosts.filter((h): h is string => typeof h === "string");
  }
  if (typeof parsed.auto_upgrade === "boolean") merged.auto_upgrade = parsed.auto_upgrade;
  if (typeof parsed.update_check === "boolean") merged.update_check = parsed.update_check;
  if (typeof parsed.learnings_enabled === "boolean") merged.learnings_enabled = parsed.learnings_enabled;
  if (typeof parsed.learnings_max_results === "number" && Number.isInteger(parsed.learnings_max_results)) {
    merged.learnings_max_results = parsed.learnings_max_results;
  }
  if (parsed.detail_level === "normal" || parsed.detail_level === "terse") {
    merged.detail_level = parsed.detail_level;
  }
  return merged;
}

/** Persist config. Creates the home directory if needed. */
export function writeConfig(cfg: TroveConfig, home: string = troveHome()): void {
  fs.mkdirSync(home, { recursive: true });
  const yaml = YAML.stringify(cfg, { indent: 2, lineWidth: 0 });
  fs.writeFileSync(configPath(home), yaml);
}

/**
 * Set a single config key by name. Accepts string values from the CLI and
 * coerces them according to the schema. Returns the updated config.
 */
export function setConfigKey(
  key: string,
  value: string,
  home: string = troveHome(),
): TroveConfig {
  const cfg = readConfig(home);
  switch (key) {
    case "hosts":
      cfg.hosts = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    case "auto_upgrade":
      cfg.auto_upgrade = parseBool(key, value);
      break;
    case "update_check":
      cfg.update_check = parseBool(key, value);
      break;
    case "learnings_enabled":
      cfg.learnings_enabled = parseBool(key, value);
      break;
    case "learnings_max_results": {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`'${key}' must be a non-negative integer (got ${JSON.stringify(value)})`);
      }
      cfg.learnings_max_results = n;
      break;
    }
    case "detail_level":
      if (value !== "normal" && value !== "terse") {
        throw new Error(`'detail_level' must be 'normal' or 'terse' (got ${JSON.stringify(value)})`);
      }
      cfg.detail_level = value;
      break;
    default:
      throw new Error(
        `Unknown config key '${key}'. Valid keys: ${Object.keys(defaultConfig()).join(", ")}.`,
      );
  }
  writeConfig(cfg, home);
  return cfg;
}

function parseBool(key: string, value: string): boolean {
  const v = value.toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  throw new Error(`'${key}' must be a boolean (got ${JSON.stringify(value)})`);
}

// ─── Slug derivation ────────────────────────────────────────

/**
 * Derive a project slug from a git remote URL. Falls back to the working
 * directory name when no usable remote exists.
 *
 * Rules:
 *   git@github.com:owner/repo.git    → owner-repo
 *   https://github.com/owner/repo    → owner-repo
 *   /path/to/myapp                   → myapp
 *
 * Slugs are lowercase, alphanumeric + hyphens. Anything else is stripped.
 */
export function slugFromRemote(remote: string | null, fallback: string): string {
  if (remote) {
    // Match owner/repo from common git remote forms.
    const match =
      remote.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/) ??
      remote.match(/^([^/:]+)\/([^/]+)$/);
    if (match) {
      return sanitize(`${match[1]}-${match[2]}`);
    }
  }
  return sanitize(fallback);
}

function sanitize(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return cleaned || "project";
}

// ─── Learnings ──────────────────────────────────────────────

export type LearningType =
  | "pattern"
  | "pitfall"
  | "preference"
  | "architecture"
  | "tool"
  | "operational";

export interface LearningEntry {
  ts: string;
  skill: string;
  type: LearningType;
  key: string;
  insight: string;
  confidence: number;
}

export interface LearningInput {
  ts?: string;
  skill: string;
  type: string;
  key: string;
  insight: string;
  confidence: number;
}

const VALID_TYPES = new Set<LearningType>([
  "pattern",
  "pitfall",
  "preference",
  "architecture",
  "tool",
  "operational",
]);

/**
 * Validate and normalize a learning input. Throws on shape violations so
 * callers can surface a clear error to the user.
 */
export function normalizeLearning(input: LearningInput): LearningEntry {
  if (!input.skill || typeof input.skill !== "string") {
    throw new Error("learning.skill is required (string)");
  }
  if (!VALID_TYPES.has(input.type as LearningType)) {
    throw new Error(
      `learning.type must be one of ${[...VALID_TYPES].join(", ")} (got ${JSON.stringify(input.type)})`,
    );
  }
  if (!input.key || typeof input.key !== "string") {
    throw new Error("learning.key is required (string)");
  }
  if (!input.insight || typeof input.insight !== "string") {
    throw new Error("learning.insight is required (string)");
  }
  if (
    typeof input.confidence !== "number" ||
    !Number.isInteger(input.confidence) ||
    input.confidence < 1 ||
    input.confidence > 5
  ) {
    throw new Error(`learning.confidence must be an integer 1-5 (got ${JSON.stringify(input.confidence)})`);
  }
  return {
    ts: input.ts ?? new Date().toISOString(),
    skill: input.skill,
    type: input.type as LearningType,
    key: input.key,
    insight: input.insight,
    confidence: input.confidence,
  };
}

/** Append a single learning entry to the project's JSONL log. */
export function appendLearning(slug: string, entry: LearningEntry, home: string = troveHome()): void {
  const filePath = learningsPath(slug, home);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
}

/** Read all entries for a project. Returns [] if the log doesn't exist. */
export function readLearnings(slug: string, home: string = troveHome()): LearningEntry[] {
  const filePath = learningsPath(slug, home);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const entries: LearningEntry[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as LearningEntry;
      entries.push(obj);
    } catch {
      // Skip malformed lines silently — the file is append-only and a
      // partial write shouldn't poison the rest of the log.
    }
  }
  return entries;
}

export interface SearchOptions {
  skill?: string;
  type?: LearningType;
  query?: string;
  limit?: number;
}

/**
 * Search learnings, newest-first. The `limit` is capped by the caller's
 * `learnings_max_results` config value; the CLI applies that cap before
 * invoking this function.
 */
export function searchLearnings(
  slug: string,
  opts: SearchOptions = {},
  home: string = troveHome(),
): LearningEntry[] {
  const all = readLearnings(slug, home);
  const filtered = all.filter((e) => {
    if (opts.skill && e.skill !== opts.skill) return false;
    if (opts.type && e.type !== opts.type) return false;
    if (opts.query) {
      const q = opts.query.toLowerCase();
      if (!e.insight.toLowerCase().includes(q) && !e.key.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  filtered.sort((a, b) => b.ts.localeCompare(a.ts));
  if (opts.limit !== undefined) return filtered.slice(0, opts.limit);
  return filtered;
}
