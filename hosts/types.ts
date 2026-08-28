/**
 * Host configuration type definitions.
 *
 * Each supported platform (Claude Code, Cursor, Codex, etc.) is defined
 * as a HostConfig object in hosts/*.ts.
 */

/**
 * Output artifact a host emits from a single canonical skill template.
 *
 *   skill          - inline `SKILL.md` (Claude, Cursor, Codex, OpenCode)
 *   rule           - Cursor `.mdc` Project Rule for scoped/always-on context
 *   agents-section - section contributed to a scoped `AGENTS.md`
 *   gemini-extension - Gemini extension context file for persistent bootstrap
 */
export type ProjectionKind = "skill" | "rule" | "agents-section" | "gemini-extension";

/**
 * Which frontmatter allowlist a `skill` projection uses. The allowlists
 * themselves live in scripts/lib/projection.ts.
 *
 *   strict — the six Agent Skills fields only
 *   claude — spec fields plus Claude Code's documented fields
 *   cursor — Cursor's documented native skill frontmatter
 */
export type ProjectionProfile = "strict" | "claude" | "cursor";

/**
 * Capability surface for a host.
 *
 * `features` (below) describes plugin-manifest surfaces (hooks, commands,
 * MCP …) that the host can install. `capabilities` describes how the host
 * **projects skill content**: which output forms it accepts and which
 * frontmatter signals it honors. The split keeps host-specific branching
 * out of the generator and resolver code — they consult capabilities
 * instead of hardcoding host names.
 */
export interface HostCapabilities {
  /** Host accepts a SKILL.md projection authored as inline markdown. */
  supportsInlineSkill: boolean;
  /** Host accepts MDC-style rule files (Cursor `.mdc`). */
  supportsRuleFiles: boolean;
  /** Host can import sidecar memory files alongside the skill body. */
  supportsImportedMemory: boolean;
  /** Host treats AGENTS.md as its primary surface. */
  supportsAgentsMd: boolean;
  /** Host honors a structured `allowed-tools` metadata field. */
  supportsToolAllowlistMetadata: boolean;
}

export interface HostConfig {
  /** Unique host identifier (e.g., 'claude'). Must match filename. */
  name: string;
  /** Human-readable name for logs (e.g., 'Claude Code'). */
  displayName: string;

  /** Subdirectory for generated output (e.g., '.claude-plugin'). */
  pluginSubdir: string;
  /** Manifest filename inside pluginSubdir. */
  manifestFile: string;
  /** Marketplace catalog subdirectory (e.g., '.claude-plugin'). */
  marketplaceSubdir: string;

  /**
   * Output kinds this host emits from a skill template. The generator fans
   * out one canonical skill into one or more host-native artifacts based on
   * this list.
   */
  projections: ProjectionKind[];

  /**
   * Which frontmatter allowlist a `skill` projection uses. `strict` emits only
   * the six Agent Skills fields; `claude` and `cursor` add each host's
   * documented extras. See scripts/lib/projection.ts.
   *
   * Hosts that emit no `skill` artifact (agents, gemini today) still declare
   * one, because the strict projection is what their content is derived from.
   */
  skillProjection: ProjectionProfile;

  /**
   * Where to drop per-skill SKILL.md output, relative to `output/<host>/`.
   * Each skill becomes `<skillOutputDir>/<skill-name>/SKILL.md`. Ignored when
   * `skill` is not in `projections`. For Claude this is unused — Claude emits
   * SKILL.md in-place next to the source template.
   */
  skillOutputDir?: string;

  /**
   * Where to drop per-rule `.mdc` files, relative to `output/<host>/`.
   * Each rule becomes `<ruleOutputDir>/<skill-name>.mdc`. Ignored when `rule`
   * is not in `projections`.
   */
  ruleOutputDir?: string;

  /**
   * Layout for AGENTS output. `flat` writes a single root AGENTS.md;
   * `scoped` writes a concise root index plus
   * `output/<host>/plugins/<plugin>/AGENTS.md` per plugin.
   */
  agentsScope?: "flat" | "scoped";

  /** Platform-specific features this host supports (plugin manifest surfaces). */
  features: {
    skills: boolean;
    commands: boolean;
    hooks: boolean;
    agents: boolean;
    mcp: boolean;
    rules: boolean;
    marketplace: boolean;
    autoUpdate: boolean;
  };

  /**
   * Projection capability map consumed by the generator and resolver
   * pipeline. Distinct from `features` (which is about plugin manifest
   * surfaces); these flags govern how skill *content* is projected.
   */
  capabilities: HostCapabilities;

  /** Content transformation rules applied to generated skill files. */
  contentRewrites: Array<{ from: string; to: string }>;

  /** Fields to strip from plugin.json generation. */
  stripPluginFields: string[];
}

export type HostName = "claude" | "cursor" | "codex" | "agents" | "opencode" | "gemini";

export interface PluginYaml {
  name: string;
  /**
   * Not authored. Present only so validation can reject a stray value —
   * shipped versions come from the repository VERSION file.
   */
  version?: string;
  description: string;
  author: { name: string; email?: string };
  homepage?: string;
  license?: string;
  keywords?: string[];
  category?: string;
  roles?: string[];
  skills?: Array<{
    path: string;
    platforms?: string[];
    auto_attach?: { globs?: string[] };
    deprecation?: {
      until?: string;
      reason?: string;
      replacement?: string;
    };
  }>;
  commands?: Array<{
    path: string;
    platforms?: string[];
  }>;
  hooks?: Record<string, Array<{ matcher: string; command: string; description?: string }>>;
  bootstrap?: {
    sessionStart?: boolean;
  };
  mcp_servers?: Record<string, Record<string, unknown>>;
  agents?: Array<{ path: string }>;
  platforms?: Record<string, Record<string, unknown>>;
}

export interface MarketplaceYaml {
  name: string;
  owner: { name: string; email?: string };
  metadata: {
    description: string;
    version: string;
    pluginRoot?: string;
  };
  plugins: Array<{
    name: string;
    source: string | { source: string; repo?: string; ref?: string; sha?: string };
    description: string;
    category?: string;
    tags?: string[];
    roles?: string[];
    curated?: boolean;
  }>;
}

export interface MarketplaceJson {
  $schema?: string;
  name: string;
  owner?: { name: string; email?: string };
  metadata?: { description: string; version: string };
  plugins: Array<{
    name: string;
    source: string | Record<string, unknown>;
    description?: string;
    category?: string;
    keywords?: string[];
    strict?: boolean;
    skills?: string[];
  }>;
}
