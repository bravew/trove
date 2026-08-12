import type { HostConfig } from "./types";

/**
 * OpenCode host.
 *
 * OpenCode does not consume Claude-style bash hooks. The generated bundle
 * includes normal SKILL.md files plus a small TypeScript plugin that prepends
 * the workflow anchor to the system prompt through OpenCode's plugin surface.
 */
const opencode: HostConfig = {
  name: "opencode",
  displayName: "OpenCode",
  pluginSubdir: ".opencode",
  manifestFile: "index.ts",
  marketplaceSubdir: "output/opencode/plugins",

  projections: ["skill"],
  skillOutputDir: "skills",

  features: {
    skills: true,
    commands: false,
    hooks: false,
    agents: false,
    mcp: false,
    rules: false,
    marketplace: false,
    autoUpdate: false,
  },

  capabilities: {
    supportsInlineSkill: false,
    supportsRuleFiles: false,
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
      "disable-model-invocation",
      "paths",
    ],
    renameFields: {},
  },

  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "[skill-dir]" },
  ],

  stripPluginFields: ["hooks", "agents", "mcp_servers"],
};

export default opencode;
