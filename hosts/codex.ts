import type { HostConfig } from "./types";

/**
 * OpenAI Codex host.
 *
 * Skills land under `.agents/skills/<skill>/SKILL.md` so that workflow
 * playbooks stay separate from plugin/integration metadata, which is emitted
 * via gen-plugins into the plugin's own `.codex-plugin/plugin.json`.
 */
const codex: HostConfig = {
  name: "codex",
  displayName: "OpenAI Codex",
  pluginSubdir: ".codex-plugin",
  manifestFile: "plugin.json",
  marketplaceSubdir: ".agents/plugins",

  projections: ["skill", "agents-section"],
  skillOutputDir: ".agents/skills",

  features: {
    skills: true,
    commands: false,
    hooks: false,
    agents: false,
    mcp: true,
    rules: false,
    marketplace: true,
    autoUpdate: true,
  },

  capabilities: {
    supportsInlineSkill: true,
    supportsRuleFiles: false,
    supportsImportedMemory: false,
    supportsAgentsMd: true,
    supportsToolAllowlistMetadata: false,
  },

  frontmatter: {
    mode: "strip-platform",
    stripFields: [
      "allowed-tools",
      "context",
      "effort",
      "disable-model-invocation",
      "paths",
    ],
    renameFields: {},
  },

  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "[skill-dir]" },
  ],

  stripPluginFields: ["hooks", "agents"],
};

export default codex;
