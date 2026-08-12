import type { HostConfig } from "./types";

/**
 * Gemini CLI host.
 *
 * Gemini extensions load persistent context from the filename declared in
 * gemini-extension.json. The generator writes GEMINI.md from the workflow
 * discipline anchor for each plugin that ships one.
 */
const gemini: HostConfig = {
  name: "gemini",
  displayName: "Gemini CLI",
  pluginSubdir: "gemini",
  manifestFile: "gemini-extension.json",
  marketplaceSubdir: "output/gemini/plugins",

  projections: ["gemini-extension"],

  features: {
    skills: false,
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
    supportsImportedMemory: true,
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
      "user-invocable",
    ],
    renameFields: {},
  },

  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "[skill-dir]" },
  ],

  stripPluginFields: ["hooks", "agents", "mcp_servers"],
};

export default gemini;
