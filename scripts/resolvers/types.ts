/**
 * Typed resolver contracts.
 *
 * Resolvers translate `{{PLACEHOLDER}}` tokens in `SKILL.md.tmpl` into
 * concrete projection output. Each resolver receives a `ResolverContext`
 * describing the skill being built and the host receiving the output, and
 * returns a `ResolverResult` that may be inlined, written as a sidecar,
 * or surfaced as pure metadata.
 *
 * The shape intentionally allows future projection modes (sidecar memory,
 * rule files, metadata blobs) without another resolver-protocol refactor —
 * even though P0 only emits `inline` results today.
 */

import type { HostConfig } from "../../hosts/types";

/** Optional v2 frontmatter fields, all additive over the v1 schema. */
export interface SkillFrontmatterV2 {
  version?: string;
  preambleTier?: number;
  triggers?: string[];
  activation?: { globs?: string[]; manual?: boolean };
  allowedTools?: string[];
  benefitsFrom?: string[];
  hostOverrides?: Record<string, Record<string, unknown>>;
  roles?: string[];
  platforms?: string[];
  /** Legacy v1 field; mirrored into `activation.globs` when present. */
  paths?: string;
  userInvocable?: boolean;
}

/** Parsed authoring frontmatter for a skill template. */
export interface SkillManifest {
  /** Skill name from frontmatter (e.g., "trove-python"). */
  name: string;
  /** Skill description (may be multi-line). */
  description: string;
  /** Absolute path to the source SKILL.md.tmpl. */
  templatePath: string;
  /** Skill source directory (parent of the template). */
  skillDir: string;
  /** Raw frontmatter YAML body (between the `---` markers). */
  rawFrontmatter: string;
  /** Parsed v2 frontmatter fields (best-effort, undefined if unset). */
  v2: SkillFrontmatterV2;
}

/** Context handed to every resolver invocation. */
export interface ResolverContext {
  /** Skill being projected (may be undefined for hostless contexts). */
  skill?: SkillManifest;
  /** Host receiving the output (may be undefined for cross-host calls). */
  host?: HostConfig;
  /** Marketplace version (from VERSION file). */
  marketplaceVersion: string;
  /** Absolute path to the workspace root. */
  projectRoot: string;
  /** Optional resolver arguments parsed from `{{NAME:arg1:arg2}}`. */
  args?: string[];
}

/**
 * What a resolver returns. Today every resolver picks `inline`; the wider
 * shape exists so future hosts (sidecar memory, rule files) can branch
 * without touching the resolver protocol.
 */
export interface ResolverResult {
  /** How the value should be projected by the generator. */
  mode: "inline" | "sidecar" | "metadata";
  /** Replacement string. For sidecar mode this is the import reference. */
  value: string;
  /** Optional sidecar path (relative to the host output dir). */
  sidecarPath?: string;
  /** Optional sidecar payload to emit alongside the projection. */
  sidecarContent?: string;
}

export type Resolver = (ctx: ResolverContext) => ResolverResult;

/** Registry of named resolvers. */
export type ResolverRegistry = Record<string, Resolver>;

/** Helper for resolvers that just want to return a string. */
export function inline(value: string): ResolverResult {
  return { mode: "inline", value };
}
