import type { HostConfig } from "./types";

/** GitHub Copilot CLI native plugin and project-skill projection. */
const copilot: HostConfig = {
  name: "copilot",
  displayName: "GitHub Copilot CLI",
  pluginSubdir: ".plugin",
  manifestFile: "plugin.json",
  marketplaceSubdir: ".github/plugin",

  projections: ["skill"],
  skillProjection: "strict",
  skillOutputDir: ".agents/skills",

  features: {
    skills: true,
    commands: true,
    hooks: true,
    agents: true,
    mcp: true,
    rules: false,
    marketplace: true,
    autoUpdate: true,
  },

  capabilities: {
    supportsInlineSkill: true,
    supportsRuleFiles: false,
    supportsImportedMemory: true,
    supportsAgentsMd: false,
    supportsToolAllowlistMetadata: false,
  },

  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "[skill-dir]" },
  ],

  stripPluginFields: [],
};

export default copilot;
