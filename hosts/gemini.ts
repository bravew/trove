import type { HostConfig } from "./types";

/**
 * Gemini CLI host.
 *
 * Two delivery paths, both documented:
 *
 *   - Workspace skills land in `.agents/skills/<skill>/SKILL.md`, which Gemini
 *     discovers directly and prefers over `.gemini/skills/` in the same tier.
 *   - `gen-plugins` copies the same files into each extension's `skills/`
 *     subdirectory, the extension-bundled tier.
 *
 * `GEMINI.md` stays what it was built for: persistent bootstrap context named
 * by `contextFileName`, not a substitute for on-demand skills.
 *
 * Verified against geminicli.com/docs/cli/skills and
 * geminicli.com/docs/extensions/reference — see docs/host-matrix.md.
 */
const gemini: HostConfig = {
  name: "gemini",
  displayName: "Gemini CLI",
  pluginSubdir: "gemini",
  manifestFile: "gemini-extension.json",
  marketplaceSubdir: "output/gemini/plugins",

  projections: ["skill", "gemini-extension"],
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
    supportsImportedMemory: true,
    supportsAgentsMd: false,
    supportsToolAllowlistMetadata: false,
  },


  contentRewrites: [
    { from: "${CLAUDE_SKILL_DIR}", to: "[skill-dir]" },
  ],

  stripPluginFields: ["hooks", "agents", "mcp_servers"],
};

export default gemini;
