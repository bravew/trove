import type { HostConfig } from "./types";

/**
 * OpenCode host.
 *
 * Skills land in `.agents/skills/<skill>/SKILL.md`, one of OpenCode's three
 * documented project discovery roots (the others being `.opencode/skills` and
 * `.claude/skills`). `.agents/skills` is the one Codex and Gemini also read,
 * so a single tree serves all three. The previous `output/opencode/skills`
 * location was not a discovery root at all.
 *
 * OpenCode recognizes only name, description, license, compatibility, and
 * metadata, and ignores everything else — the strict projection emits exactly
 * that set.
 *
 * OpenCode does not consume Claude-style bash hooks, so the bundle also ships
 * a small TypeScript plugin that prepends the workflow anchor to the system
 * prompt through OpenCode's plugin surface.
 *
 * Verified against opencode.ai/docs/skills — see docs/host-matrix.md.
 */
const opencode: HostConfig = {
  name: "opencode",
  displayName: "OpenCode",
  pluginSubdir: ".opencode",
  manifestFile: "index.ts",
  marketplaceSubdir: "output/opencode/plugins",

  projections: ["skill"],
  skillProjection: "strict",
  skillOutputDir: ".agents/skills",

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
    supportsInlineSkill: true,
    supportsRuleFiles: false,
    supportsImportedMemory: false,
    supportsAgentsMd: false,
    supportsToolAllowlistMetadata: false,
  },


  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "[skill-dir]" },
  ],

  stripPluginFields: ["hooks", "agents", "mcp_servers"],
};

export default opencode;
