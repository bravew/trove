import type { HostConfig } from "./types";

/**
 * Cursor host.
 *
 * Cursor now reads Agent Skills natively from `.agents/skills/`. Project
 * Rules still matter for deterministic glob/always-on context, but broad
 * workflow bodies should ship as skills rather than duplicated `.mdc` rules.
 * Cursor's legacy `.cursorrules` is intentionally not produced.
 */
const cursor: HostConfig = {
  name: "cursor",
  displayName: "Cursor",
  pluginSubdir: ".cursor-plugin",
  manifestFile: "plugin.json",
  marketplaceSubdir: ".cursor-plugin",

  projections: ["skill", "rule"],
  skillOutputDir: ".agents/skills",
  ruleOutputDir: "rules",

  features: {
    skills: true,
    commands: false,
    hooks: true,
    agents: false,
    mcp: true,
    rules: true,
    marketplace: true,
    autoUpdate: true,
  },

  capabilities: {
    supportsInlineSkill: true,
    supportsRuleFiles: true,
    supportsImportedMemory: false,
    supportsAgentsMd: false,
    supportsToolAllowlistMetadata: false,
  },

  frontmatter: {
    mode: "strip-platform",
    stripFields: [
      "allowed-tools",
      "context",
      "effort",
      "version",
      "preamble-tier",
      "activation",
      "triggers",
      "benefits-from",
      "user-invocable",
    ],
    renameFields: {},
  },

  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "[skill-dir]" },
  ],

  stripPluginFields: ["agents"],
};

export default cursor;
