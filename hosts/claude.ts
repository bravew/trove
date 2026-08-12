import type { HostConfig } from "./types";

const claude: HostConfig = {
  name: "claude",
  displayName: "Claude Code",
  pluginSubdir: ".claude-plugin",
  manifestFile: "plugin.json",
  marketplaceSubdir: ".claude-plugin",

  projections: ["skill"],

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

  frontmatter: {
    mode: "keep",
    stripFields: [],
    renameFields: {},
  },

  contentRewrites: [],

  stripPluginFields: [],
};

export default claude;
