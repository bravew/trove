/**
 * Authoring → host projection contract.
 *
 * Trove authors skills in a private DSL (`version`, `preamble-tier`,
 * `activation`, `triggers`, `benefits-from`, `host-overrides`). That
 * vocabulary is a build input, not a wire format: every emitted artifact goes
 * through an explicit per-host allowlist here so an internal field can never
 * leak into a host's frontmatter by accident.
 *
 * Three projection profiles exist:
 *
 *   strict — the six Agent Skills fields only (Codex, OpenCode, Gemini,
 *            AGENTS.md, uploads, and any strict spec consumer).
 *   claude — spec fields plus documented Claude Code fields (`paths`,
 *            `when_to_use`, invocation controls, `context`, `model`).
 *   cursor — Cursor's documented native skill frontmatter.
 *
 * See dev-doc/2026-08-modernization-plan.md §3 for the target contract and
 * scripts/lib/agent-skills-spec.ts for the spec rules the strict profile
 * must satisfy.
 */

import type { ProjectionProfile } from "../../hosts/types";
import { DESCRIPTION_MAX } from "./agent-skills-spec";

export type { ProjectionProfile };

/**
 * A skill's authoring frontmatter, normalized. Every field a projection can
 * emit is derived from this — projections never re-read raw YAML.
 */
export interface AuthoringSkill {
  /** Skill directory basename; the spec requires `name` to equal it. */
  dirName: string;
  name: string;
  /** Flattened to a single line; block scalars are collapsed. */
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, unknown>;
  /** Authored as a YAML list; encoded per profile. */
  allowedTools?: string[];
  /** `activation.globs`, with legacy top-level `paths:` as a fallback. */
  globs: string[];
  /**
   * Manual-only: the model must not auto-invoke this skill. Authored as
   * `activation.manual: true` (or an explicit `disable-model-invocation: true`).
   *
   * This is deliberately NOT derived from `user-invocable: false`, which means
   * the opposite — see the plan's F2. Conflating the two turned model-only
   * skills into manual-only skills in Cursor.
   */
  manualOnly: boolean;
  /** Explicit `user-invocable:` value, when authored. Claude-only signal. */
  userInvocable?: boolean;
  triggers: string[];
  /** `host-overrides.<host>` maps, applied after the base projection. */
  hostOverrides: Record<string, Record<string, unknown>>;
}

// ─── Per-profile field allowlists (also the emission order) ──

/**
 * Claude Code's documented frontmatter reference, as of the verification date
 * in docs/host-matrix.md. Fields Trove does not derive from authoring input
 * are still listed so a skill can reach them through `host-overrides.claude`.
 */
const CLAUDE_FIELDS = [
  "name",
  "description",
  "license",
  "compatibility",
  "paths",
  "when_to_use",
  "argument-hint",
  "arguments",
  "user-invocable",
  "disable-model-invocation",
  "context",
  "agent",
  "background",
  "model",
  "effort",
  "shell",
  "allowed-tools",
  "disallowed-tools",
  "hooks",
  "metadata",
] as const;

const CURSOR_FIELDS = [
  "name",
  "description",
  "paths",
  "disable-model-invocation",
  "icon",
  "color",
  "metadata",
] as const;

const STRICT_FIELDS = [
  "name",
  "description",
  "license",
  "compatibility",
  "allowed-tools",
  "metadata",
] as const;

export const PROFILE_FIELDS: Record<ProjectionProfile, readonly string[]> = {
  claude: CLAUDE_FIELDS,
  cursor: CURSOR_FIELDS,
  strict: STRICT_FIELDS,
};

// ─── Normalization ──────────────────────────────────────────

export function flattenDescription(description: string): string {
  return description.replace(/\s+/g, " ").trim();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/**
 * Normalize a parsed frontmatter object into the authoring contract.
 *
 * Unknown keys are dropped here rather than passed along: a field that no
 * projection knows about has no defined wire representation.
 */
export function toAuthoringSkill(
  fm: Record<string, unknown>,
  dirName: string,
): AuthoringSkill {
  const activation =
    fm.activation && typeof fm.activation === "object" && !Array.isArray(fm.activation)
      ? (fm.activation as { globs?: unknown; manual?: unknown })
      : undefined;

  // activation.globs is canonical; legacy top-level `paths:` (string or list)
  // is still accepted while templates migrate.
  let globs = stringList(activation?.globs);
  if (globs.length === 0) {
    if (typeof fm.paths === "string") {
      globs = fm.paths.split(",").map((p) => p.trim()).filter(Boolean);
    } else {
      globs = stringList(fm.paths);
    }
  }

  const skill: AuthoringSkill = {
    dirName,
    name: typeof fm.name === "string" ? fm.name.trim() : "",
    description: typeof fm.description === "string" ? flattenDescription(fm.description) : "",
    globs,
    manualOnly: activation?.manual === true || fm["disable-model-invocation"] === true,
    triggers: stringList(fm.triggers),
    hostOverrides:
      fm["host-overrides"] && typeof fm["host-overrides"] === "object" && !Array.isArray(fm["host-overrides"])
        ? (fm["host-overrides"] as Record<string, Record<string, unknown>>)
        : {},
  };

  if (typeof fm.license === "string") skill.license = fm.license;
  if (typeof fm.compatibility === "string") skill.compatibility = fm.compatibility;
  if (typeof fm["user-invocable"] === "boolean") skill.userInvocable = fm["user-invocable"];
  if (fm.metadata && typeof fm.metadata === "object" && !Array.isArray(fm.metadata)) {
    skill.metadata = fm.metadata as Record<string, unknown>;
  }
  const tools = stringList(fm["allowed-tools"]);
  if (tools.length > 0) skill.allowedTools = tools;

  return skill;
}

/**
 * Strict artifacts have no `when_to_use` or `triggers` field, so trigger
 * language has to survive inside `description` or discovery regresses.
 * Triggers are appended only while the result fits the spec's 1024-char cap;
 * the description itself always wins over the appended list.
 */
export function foldTriggersIntoDescription(description: string, triggers: string[]): string {
  const base = flattenDescription(description);
  if (triggers.length === 0) return base;

  for (let count = triggers.length; count > 0; count--) {
    const suffix = ` Use when: ${triggers.slice(0, count).join("; ")}.`;
    if (base.length + suffix.length <= DESCRIPTION_MAX) return base + suffix;
  }
  return base;
}

// ─── Projection ─────────────────────────────────────────────

export interface ProjectionTarget {
  profile: ProjectionProfile;
  /** Selects the `host-overrides` block to merge. */
  hostName: string;
  /**
   * Whether the host honors a tool allowlist. The spec encodes
   * `allowed-tools` as a space-separated list, which cannot represent an
   * authored pattern containing whitespace such as `Bash(git *)`; emitting one
   * anyway produces a corrupt token. Hosts that ignore the field get nothing
   * rather than something wrong. Mirrors `HostCapabilities`.
   */
  supportsToolAllowlist: boolean;
}

/**
 * Build the frontmatter a host should receive, as an ordered plain object.
 *
 * Host overrides are filtered through the same profile allowlist, so an
 * override cannot smuggle an unsupported field into a host either.
 */
export function projectFrontmatter(
  skill: AuthoringSkill,
  target: ProjectionTarget,
): Record<string, unknown> {
  const { profile, hostName, supportsToolAllowlist } = target;
  const draft: Record<string, unknown> = {};

  draft.name = skill.name;

  if (profile === "strict") {
    draft.description = foldTriggersIntoDescription(skill.description, skill.triggers);
  } else {
    draft.description = skill.description;
  }

  if (skill.license !== undefined) draft.license = skill.license;
  if (skill.compatibility !== undefined) draft.compatibility = skill.compatibility;

  if (profile === "claude" || profile === "cursor") {
    if (skill.globs.length > 0) draft.paths = skill.globs;
  }

  if (profile === "claude") {
    if (skill.triggers.length > 0) draft.when_to_use = skill.triggers.join("; ");
    if (skill.userInvocable !== undefined) draft["user-invocable"] = skill.userInvocable;
  }

  // Emitted only from an explicit manual-only authoring signal. Omission is
  // the correct default: every host treats a missing value as model-invocable.
  if ((profile === "claude" || profile === "cursor") && skill.manualOnly) {
    draft["disable-model-invocation"] = true;
  }

  if (supportsToolAllowlist && skill.allowedTools && skill.allowedTools.length > 0) {
    // Claude documents a YAML list; the spec's encoding is space-separated.
    draft["allowed-tools"] =
      profile === "claude" ? skill.allowedTools : skill.allowedTools.join(" ");
  }

  if (skill.metadata && Object.keys(skill.metadata).length > 0) {
    draft.metadata = skill.metadata;
  }

  for (const [key, value] of Object.entries(skill.hostOverrides[hostName] ?? {})) {
    draft[key] = value;
  }

  // Filter and order in one pass so output is deterministic and no field
  // outside the profile can survive.
  const allowed = PROFILE_FIELDS[profile];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (draft[key] !== undefined) out[key] = draft[key];
  }
  return out;
}

// ─── YAML emission ──────────────────────────────────────────

/**
 * Plain scalars that YAML reads back as exactly the string written: no
 * leading indicator character, no separator punctuation, and not one of the
 * literals a YAML 1.1 parser would coerce to a boolean or null.
 */
const PLAIN_SCALAR = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const YAML_LITERALS = new Set([
  "true", "false", "yes", "no", "on", "off", "null", "y", "n",
]);

function scalar(value: string): string {
  if (PLAIN_SCALAR.test(value) && !YAML_LITERALS.has(value.toLowerCase())) return value;
  // JSON is a valid YAML double-quoted scalar and every JSON escape is also a
  // YAML one, so this needs no separate escaping pass.
  return JSON.stringify(value);
}

/**
 * Emit frontmatter as YAML, including the `---` delimiters.
 *
 * Anything with punctuation — descriptions, globs — is double-quoted, so a
 * colon or a leading `*` in an authored value can never break the parse.
 */
export function emitFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "boolean" || typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${scalar(value)}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${scalar(String(item))}`);
    } else if (value && typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${k}: ${scalar(String(v))}`);
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}
