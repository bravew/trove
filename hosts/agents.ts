import type { HostConfig } from "./types";

/**
 * Generic AGENTS.md host — fallback for Copilot, Windsurf, Aider, JetBrains
 * Junie, etc.
 *
 * Output is scoped: a concise `output/agents/AGENTS.md` index points at
 * `output/agents/plugins/<plugin>/AGENTS.md`, which contains only the skills
 * belonging to that plugin. Tools that consume AGENTS.md use nearest-scope
 * precedence, so per-plugin files behave like project-local guidance once a
 * plugin is dropped into a repo.
 */
const agents: HostConfig = {
  name: "agents",
  displayName: "Generic (AGENTS.md)",
  pluginSubdir: "",
  manifestFile: "AGENTS.md",
  marketplaceSubdir: "",

  projections: ["agents-section"],
  agentsScope: "scoped",

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
      "user-invocable",
    ],
    renameFields: {},
  },

  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "" },
  ],

  stripPluginFields: ["hooks", "agents", "mcp_servers"],
};

export default agents;
