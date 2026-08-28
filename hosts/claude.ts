import type { HostConfig } from "./types";

const claude: HostConfig = {
  name: "claude",
  displayName: "Claude Code",
  pluginSubdir: ".claude-plugin",
  manifestFile: "plugin.json",
  marketplaceSubdir: ".claude-plugin",

  projections: ["skill"],
  skillProjection: "claude",

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
    supportsToolAllowlistMetadata: true,
  },


  contentRewrites: [],

  stripPluginFields: [],
};

export default claude;
