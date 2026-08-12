#!/usr/bin/env bun
/**
 * Stage 2: Generate per-platform plugin.json from plugin.yaml manifests.
 *
 * Pipeline:
 *   read plugin.yaml → project to per-platform plugin.json
 *   copy/symlink skill outputs into plugin bundle directories
 *
 * Usage:
 *   bun run build:plugins
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import { getMarketplaceHosts } from "../hosts/index";
import type { PluginYaml } from "../hosts/types";

const ROOT = path.resolve(import.meta.dir, "..");
const PLUGINS_DIR = path.join(ROOT, "plugins");

/**
 * Per-plugin manifest `version` is derived from the marketplace's `VERSION`
 * file rather than the per-plugin `version:` field in `plugin.yaml`. Reasoning:
 *
 * Claude Code's update detection compares the resolved version in
 * `plugin.json` against the user's installed version; if they match,
 * `/plugin update` and auto-update SKIP the plugin entirely
 * (https://code.claude.com/docs/en/plugins-reference#version-management).
 * Hardcoding `1.0.0` per plugin would silently freeze every install at
 * 1.0.0 forever.
 *
 * Tying every plugin to the marketplace version means each release
 * (`bump-version.ts` runs in release.yml on merge to main, calendar-versioned
 * YYYY.M.D) propagates an update to every installed plugin. CalVer fits
 * semver's MAJOR.MINOR.PATCH numeric format, so 2026.5.1 > 1.0.0 is a
 * clean upgrade for anyone who happens to have an old hand-bumped install.
 */
const MARKETPLACE_VERSION = fs.readFileSync(path.join(ROOT, "VERSION"), "utf-8").trim();

interface PluginGenerationContext {
  cursorRuleCount: number;
}

// ─── Plugin discovery ────────────────────────────────────────

function findPlugins(): string[] {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      return fs.existsSync(path.join(PLUGINS_DIR, name, "plugin.yaml"));
    });
}

// ─── Plugin.yaml parsing ────────────────────────────────────

function readPluginYaml(pluginName: string): PluginYaml {
  const yamlPath = path.join(PLUGINS_DIR, pluginName, "plugin.yaml");
  const content = fs.readFileSync(yamlPath, "utf-8");
  return YAML.parse(content) as PluginYaml;
}

// ─── Claude Code plugin.json generation ─────────────────────

/**
 * Transform plugin.yaml's flat hook shape into Claude Code's required
 * nested plugin-manifest shape, and rewrite the placeholder env var.
 *
 * YAML (authoring shape):
 *   PostToolUse:
 *     - matcher: "Write|Edit"
 *       command: "${PLUGIN_ROOT}/hooks/auto-lint.sh"
 *       description: "..."
 *
 * Claude plugin.json (required shape):
 *   PostToolUse:
 *     - matcher: "Write|Edit"
 *       hooks:
 *         - type: "command"
 *           command: "${CLAUDE_PLUGIN_ROOT}/hooks/auto-lint.sh"
 *
 * Without this transform, `claude plugin install` rejects the manifest
 * with `hooks: Invalid input`.
 */
function transformHooksForClaude(
  hooks: Record<string, Array<{ matcher?: string; command: string; description?: string }>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [event, entries] of Object.entries(hooks)) {
    out[event] = entries.map((entry) => {
      const claudeCommand = entry.command.replace(/\$\{PLUGIN_ROOT\}/g, "${CLAUDE_PLUGIN_ROOT}");
      const wrapped: Record<string, unknown> = {};
      if (entry.matcher !== undefined) wrapped.matcher = entry.matcher;
      wrapped.hooks = [{ type: "command", command: claudeCommand }];
      return wrapped;
    });
  }
  return out;
}

function transformHooksForCursor(
  hooks: Record<string, Array<{ matcher?: string; command: string; description?: string }>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [event, entries] of Object.entries(hooks)) {
    out[event] = entries.map((entry) => {
      const cursorCommand = entry.command.replace(/\$\{PLUGIN_ROOT\}/g, "${CURSOR_PLUGIN_ROOT}");
      const wrapped: Record<string, unknown> = {};
      if (entry.matcher !== undefined) wrapped.matcher = entry.matcher;
      wrapped.hooks = [{ type: "command", command: cursorCommand }];
      return wrapped;
    });
  }
  return out;
}

/**
 * Filter MCP servers down to those the harness should register.
 *
 * Plugins flag servers that are likely already provided by an
 * official Claude Code marketplace plugin (e.g. the standalone
 * `linear`, `notion`, `slack`, `figma`, `sentry` plugins) with
 * `optional: true` in plugin.yaml. Without filtering, the harness
 * registers our duplicate server, then logs a "skipped — same
 * command/URL as server provided by plugin X" warning on every
 * session start.
 *
 * Claude Code does not currently honor any "default-disabled" flag
 * for plugin-provided MCP servers (see anthropics/claude-code#27105).
 * Until it does, the cleanest behavior is to keep the metadata in
 * plugin.yaml for documentation and routing, but omit `optional`
 * servers from the generated plugin.json so the harness never
 * tries to register them.
 *
 * Returns undefined when no servers remain — callers should then
 * skip emitting the field entirely.
 */
function filterRegisterableMcpServers(
  mcpServers: Record<string, { optional?: boolean } & Record<string, unknown>> | undefined,
): Record<string, unknown> | undefined {
  if (!mcpServers || Object.keys(mcpServers).length === 0) return undefined;
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(mcpServers)) {
    if (entry?.optional === true) continue;
    out[name] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function generateClaudePluginJson(plugin: PluginYaml): Record<string, unknown> {
  const json: Record<string, unknown> = {
    name: plugin.name,
    description: plugin.description,
    version: MARKETPLACE_VERSION,
    author: plugin.author,
  };

  // Skills (auto-activating, model-invoked)
  if (plugin.skills?.length) {
    const claudeSkills = plugin.skills
      .filter((s) => !s.platforms || s.platforms.includes("claude"))
      .map((s) => s.path);
    if (claudeSkills.length > 0) json.skills = claudeSkills;
  }

  // Commands (user-invokable flat .md files, auto-namespaced as /plugin-name:cmd)
  if (plugin.commands?.length) {
    const claudeCommands = plugin.commands
      .filter((c) => !c.platforms || c.platforms.includes("claude"))
      .map((c) => c.path);
    if (claudeCommands.length > 0) json.commands = claudeCommands;
  }

  // Hooks
  if (plugin.hooks && Object.keys(plugin.hooks).length > 0) {
    json.hooks = transformHooksForClaude(
      plugin.hooks as Record<string, Array<{ matcher?: string; command: string; description?: string }>>,
    );
  }

  // Agents
  if (plugin.agents?.length) {
    json.agents = plugin.agents.map((a) => a.path);
  }

  // MCP servers (only the non-optional ones — see filterRegisterableMcpServers)
  const claudeMcp = filterRegisterableMcpServers(
    plugin.mcp_servers as Record<string, { optional?: boolean } & Record<string, unknown>> | undefined,
  );
  if (claudeMcp) json.mcpServers = claudeMcp;

  return json;
}

// ─── Cursor plugin.json generation ──────────────────────────

function generateCursorPluginJson(
  plugin: PluginYaml,
  context: PluginGenerationContext,
): Record<string, unknown> {
  const json: Record<string, unknown> = {
    name: plugin.name,
    description: plugin.description,
    version: MARKETPLACE_VERSION,
  };

  if (plugin.skills?.length) {
    const cursorSkills = plugin.skills
      .filter((s) => !s.platforms || s.platforms.includes("cursor"))
      .map((s) => `./.agents/skills/${path.basename(s.path)}`);
    if (cursorSkills.length > 0) json.skills = cursorSkills;
  }

  // Rules directory
  const cursorPlatform = plugin.platforms?.cursor;
  if (
    cursorPlatform &&
    typeof cursorPlatform === "object" &&
    "rules_dir" in cursorPlatform &&
    context.cursorRuleCount > 0
  ) {
    json.rules = [cursorPlatform.rules_dir];
  }

  // MCP servers (Cursor supports these — same optional-filter rationale as Claude)
  const cursorMcp = filterRegisterableMcpServers(
    plugin.mcp_servers as Record<string, { optional?: boolean } & Record<string, unknown>> | undefined,
  );
  if (cursorMcp) json.mcpServers = cursorMcp;

  if (plugin.hooks && Object.keys(plugin.hooks).length > 0) {
    json.hooks = transformHooksForCursor(
      plugin.hooks as Record<string, Array<{ matcher?: string; command: string; description?: string }>>,
    );
  }

  return json;
}

// ─── Codex plugin.json generation ───────────────────────────

/**
 * Codex's per-plugin manifest (.codex-plugin/plugin.json) uses a different
 * schema than Claude's (https://developers.openai.com/codex/plugins/build):
 *
 *   - `skills` is a SINGLE STRING path to the skills directory, NOT an
 *     array of skill paths. Codex auto-discovers SKILL.md files under
 *     that directory. Emitting an array causes Codex's `plugin/read` to
 *     fail with "Plugin detail unavailable" in the TUI.
 *   - Optional `interface` block surfaces display metadata in the
 *     `/plugins` browser. We populate displayName, category, and
 *     shortDescription from plugin.yaml; richer fields (icons, screenshots)
 *     are author-supplied and not auto-derived.
 */
function generateCodexPluginJson(plugin: PluginYaml): Record<string, unknown> {
  const json: Record<string, unknown> = {
    name: plugin.name,
    description: plugin.description,
    version: MARKETPLACE_VERSION,
  };

  // `skills`: directory path (single string), NOT array. Every Trove
  // plugin uses `skills/` for its bundle, so we always emit that path
  // when at least one skill targets codex.
  const hasCodexSkills = plugin.skills?.some(
    (s) => !s.platforms || s.platforms.includes("codex"),
  );
  if (hasCodexSkills) json.skills = "./skills/";

  // Interface metadata for the Codex /plugins TUI browser.
  json.interface = {
    displayName: plugin.name,
    category: plugin.category ?? "Productivity",
    shortDescription: plugin.description,
  };

  return json;
}

function hasUsingAnchor(plugin: PluginYaml): boolean {
  return (plugin.skills ?? []).some((skill) => path.basename(skill.path).startsWith("using-"));
}

function generateOpenCodePluginIndex(plugin: PluginYaml): string {
  const anchor = (plugin.skills ?? [])
    .map((skill) => path.basename(skill.path))
    .find((name) => name.startsWith("using-"));
  const anchorPath = anchor ? `../../skills/${anchor}/SKILL.md` : "../../skills/using-trove/SKILL.md";
  const skillsJson = JSON.stringify((plugin.skills ?? []).map((skill) => path.basename(skill.path)));
  const templatePath = path.join(PLUGINS_DIR, plugin.name, ".opencode", "index.ts.tmpl");
  const fallbackTemplate = `// AUTO-GENERATED by bun run build:plugins - do not edit directly.
// OpenCode plugin bootstrap for {{PLUGIN_NAME}}.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const anchorPath = join(__dirname, {{ANCHOR_PATH}});
const skillsDir = join(__dirname, "../../skills");
const skillNames = {{SKILLS_JSON}};

let cachedAnchor: string | undefined;
function readAnchor(): string {
  if (cachedAnchor !== undefined) return cachedAnchor;
  try {
    cachedAnchor = readFileSync(anchorPath, "utf8");
  } catch {
    cachedAnchor = "";
  }
  return cachedAnchor;
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\\n")) return content.trimStart();
  const end = content.indexOf("\\n---", 4);
  if (end === -1) return content.trimStart();
  return content.slice(content.indexOf("\\n", end + 1) + 1).trimStart();
}

function frontmatterField(content: string, field: string): string {
  const match = content.match(new RegExp(\`^\${field}:\\\\s*"?([^"\\\\n]+)"?\`, "m"));
  return match?.[1]?.trim() ?? "";
}

function readSkill(skillName: string): string {
  if (!skillNames.includes(skillName)) {
    return \`Error: Skill "\${skillName}" not found. Available skills: \${skillNames.join(", ")}.\`;
  }

  const skillPath = join(skillsDir, skillName, "SKILL.md");
  const content = readFileSync(skillPath, "utf8");
  const name = frontmatterField(content, "name") || skillName;
  const description = frontmatterField(content, "description");
  const body = stripFrontmatter(content).trim();

  return \`# \${name}
# \${description}
# Supporting tools and docs are in \${join(skillsDir, skillName)}
# ============================================

\${body}\`;
}

export default async function TroveOpenCodePlugin({ app }: { app: any }) {
  let useSkillSchema: any = {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "Name of the Trove skill to load, for example trove-brainstorm.",
      },
    },
    required: ["skill_name"],
  };
  try {
    const { z } = await import("zod");
    useSkillSchema = z.object({
      skill_name: z.string().describe("Name of the Trove skill to load, for example trove-brainstorm."),
    });
  } catch {
    // OpenCode builds vary in whether zod is available to plugins; JSON schema is the fallback.
  }

  const prependAnchor = (systemPrompt: string) => {
    const anchor = readAnchor();
    if (!anchor || systemPrompt.includes("Skill: using-trove")) return systemPrompt;
    return anchor + "\\n\\n" + systemPrompt;
  };

  if (app?.systemPrompt?.transform) {
    app.systemPrompt.transform(prependAnchor);
  } else if (app?.hooks?.systemPrompt) {
    app.hooks.systemPrompt(prependAnchor);
  }

  return {
    name: {{PLUGIN_NAME_JSON}},
    skills: skillNames,
    tools: [
      {
        name: "use_skill",
        description: "Load and read a specific Trove skill to guide the current task.",
        schema: useSkillSchema,
        execute: async ({ skill_name }: { skill_name: string }) => readSkill(skill_name),
      },
    ],
  };
}
`;
  const template = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, "utf-8") : fallbackTemplate;
  return template
    .replaceAll("{{PLUGIN_NAME}}", plugin.name)
    .replaceAll("{{PLUGIN_NAME_JSON}}", JSON.stringify(plugin.name))
    .replaceAll("{{ANCHOR_PATH}}", JSON.stringify(anchorPath))
    .replaceAll("{{SKILLS_JSON}}", skillsJson);
}

function writeOpenCodeArtifacts(pluginName: string, plugin: PluginYaml): void {
  if (!hasUsingAnchor(plugin)) return;
  const pluginDir = path.join(ROOT, "output", "opencode", "plugins", pluginName);
  fs.mkdirSync(pluginDir, { recursive: true });
  const outputPath = path.join(pluginDir, "index.ts");
  fs.writeFileSync(outputPath, generateOpenCodePluginIndex(plugin));
  console.log(`  GENERATED: ${path.relative(ROOT, outputPath)}`);
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content.trimStart();
  const end = content.indexOf("\n---", 4);
  if (end === -1) return content.trimStart();
  return content.slice(content.indexOf("\n", end + 1) + 1).trimStart();
}

function writeGeminiArtifacts(pluginName: string, plugin: PluginYaml): void {
  const anchor = (plugin.skills ?? [])
    .map((skill) => path.basename(skill.path))
    .find((name) => name.startsWith("using-"));
  if (!anchor) return;

  const sourceDir = findSkillSource(anchor, pluginName);
  if (!sourceDir) return;
  const sourcePath = path.join(sourceDir, "SKILL.md");
  if (!fs.existsSync(sourcePath)) return;

  const outputDir = path.join(ROOT, "output", "gemini", "plugins", pluginName);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "gemini-extension.json"),
    JSON.stringify({ contextFileName: "GEMINI.md" }, null, 2) + "\n",
  );
  fs.writeFileSync(path.join(outputDir, "GEMINI.md"), stripFrontmatter(fs.readFileSync(sourcePath, "utf-8")));
  console.log(`  GENERATED: ${path.relative(ROOT, path.join(outputDir, "gemini-extension.json"))}`);
  console.log(`  GENERATED: ${path.relative(ROOT, path.join(outputDir, "GEMINI.md"))}`);
}

// ─── Skill file copying ─────────────────────────────────────

function copySkillsToPlugin(pluginName: string, plugin: PluginYaml): void {
  if (!plugin.skills) return;

  for (const skill of plugin.skills) {
    const skillName = path.basename(skill.path);
    const skillSourceDir = findSkillSource(skillName, pluginName);

    if (!skillSourceDir) {
      console.warn(`  WARNING: Skill source not found for ${skillName}`);
      continue;
    }

    const destDir = path.join(PLUGINS_DIR, pluginName, "skills", skillName);
    fs.mkdirSync(destDir, { recursive: true });

    // Copy the generated SKILL.md (from .tmpl if exists, otherwise direct)
    const tmplPath = path.join(skillSourceDir, "SKILL.md.tmpl");
    const mdPath = path.join(skillSourceDir, "SKILL.md");

    if (fs.existsSync(mdPath)) {
      const destPath = path.join(destDir, "SKILL.md");
      if (path.resolve(mdPath) !== path.resolve(destPath)) {
        fs.copyFileSync(mdPath, destPath);
      }
    } else if (fs.existsSync(tmplPath)) {
      console.warn(`  WARNING: ${skillName}/SKILL.md not found. Run build:skills first.`);
    }

    // Copy references/ and scripts/ if they exist
    for (const subdir of ["references", "scripts"]) {
      const src = path.join(skillSourceDir, subdir);
      if (fs.existsSync(src)) {
        copyDirRecursive(src, path.join(destDir, subdir));
      }
    }
  }
}

function copyCursorSkillsToPlugin(pluginName: string, plugin: PluginYaml): void {
  const destRoot = path.join(PLUGINS_DIR, pluginName, ".agents", "skills");
  fs.rmSync(destRoot, { recursive: true, force: true });

  if (!plugin.skills?.length) return;

  const cursorSkillsRoot = path.join(ROOT, "output", "cursor", ".agents", "skills");
  if (!fs.existsSync(cursorSkillsRoot)) return;

  let copied = 0;
  for (const skill of plugin.skills) {
    if (skill.platforms && !skill.platforms.includes("cursor")) continue;

    const skillName = path.basename(skill.path);
    const generatedDir = path.join(cursorSkillsRoot, skillName);
    if (!fs.existsSync(path.join(generatedDir, "SKILL.md"))) continue;

    const destDir = path.join(destRoot, skillName);
    copyDirRecursive(generatedDir, destDir);

    const sourceDir = findSkillSource(skillName, pluginName);
    if (sourceDir) {
      for (const subdir of ["references", "scripts"]) {
        const src = path.join(sourceDir, subdir);
        if (fs.existsSync(src)) copyDirRecursive(src, path.join(destDir, subdir));
      }
    }

    copied++;
  }

  if (copied > 0) {
    console.log(`  COPIED: ${copied} cursor skill(s) to plugins/${pluginName}/.agents/skills/`);
  }
}

// ─── Cursor rule (.mdc) copying ──────────────────────────────

/**
 * Copy generated Cursor `.mdc` rules from `output/cursor/rules/` into each
 * plugin's bundled `rules/` directory so the rule actually ships when Cursor
 * installs the plugin. Without this step the rules live only in the build
 * output and never reach the plugin manifest's `rules` path, which is the
 * delivery channel Cursor scans on install.
 *
 * Only runs for skills that target cursor (filtered by `skill.platforms`),
 * and only when the source `.mdc` exists in `output/cursor/rules/`. The
 * The destination `rules/` directory is wiped first so skills that no longer
 * emit rules remove their stale bundle artifacts.
 */
function copyRulesToPlugin(pluginName: string, plugin: PluginYaml): number {
  const destDir = path.join(PLUGINS_DIR, pluginName, "rules");
  fs.rmSync(destDir, { recursive: true, force: true });

  if (!plugin.skills?.length) return 0;

  const cursorRulesDir = path.join(ROOT, "output", "cursor", "rules");
  if (!fs.existsSync(cursorRulesDir)) return 0;
  let copied = 0;

  for (const skill of plugin.skills) {
    if (skill.platforms && !skill.platforms.includes("cursor")) continue;
    const skillName = path.basename(skill.path);
    const srcPath = path.join(cursorRulesDir, `${skillName}.mdc`);
    if (!fs.existsSync(srcPath)) continue;

    if (copied === 0) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${skillName}.mdc`));
    copied++;
  }

  if (copied > 0) {
    console.log(`  COPIED: ${copied} cursor rule(s) to plugins/${pluginName}/rules/`);
  }
  return copied;
}

// ─── Command file copying ────────────────────────────────────

function copyCommandsToPlugin(pluginName: string, plugin: PluginYaml): void {
  const commandsRoot = path.join(ROOT, "commands");
  const destDir = path.join(PLUGINS_DIR, pluginName, "commands");
  fs.rmSync(destDir, { recursive: true, force: true });

  if (!plugin.commands?.length) return;

  fs.mkdirSync(destDir, { recursive: true });

  for (const cmd of plugin.commands) {
    const cmdFilename = path.basename(cmd.path);
    const srcPath = path.join(commandsRoot, cmdFilename);

    if (!fs.existsSync(srcPath)) {
      console.warn(`  WARNING: Command source not found: ${cmdFilename}`);
      continue;
    }

    fs.copyFileSync(srcPath, path.join(destDir, cmdFilename));
    console.log(`  COPIED: commands/${cmdFilename}`);
  }
}

function findSkillSource(skillName: string, pluginName?: string): string | null {
  // A skill authored directly inside a plugin — a deprecation-alias stub or a
  // vendored skill — has its own SKILL.md.tmpl there; prefer it. We require the
  // .tmpl specifically: a plugin-local dir holding only a generated SKILL.md is
  // the copy *destination*, and treating that as the source (the old behavior,
  // which also accepted a bare SKILL.md) made the build copy a stale bundle
  // onto itself and never refresh it from the canonical template.
  if (pluginName) {
    const local = path.join(ROOT, "plugins", pluginName, "skills", skillName);
    if (fs.existsSync(path.join(local, "SKILL.md.tmpl"))) {
      return local;
    }
  }

  // Canonical source under skills/<category>/<skillName>.
  const skillsRoot = path.join(ROOT, "skills");
  if (!fs.existsSync(skillsRoot)) return null;

  // Recursively scan all category directories under skills/
  for (const category of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!category.isDirectory() || category.name.startsWith(".")) continue;
    const candidate = path.join(skillsRoot, category.name, skillName);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Plugin.json generators per host ────────────────────────

type PluginJsonGenerator = (plugin: PluginYaml, context: PluginGenerationContext) => Record<string, unknown>;

const GENERATORS: Record<string, PluginJsonGenerator> = {
  claude: (plugin) => generateClaudePluginJson(plugin),
  cursor: generateCursorPluginJson,
  codex: (plugin) => generateCodexPluginJson(plugin),
};

// ─── Main ───────────────────────────────────────────────────

const pluginNames = findPlugins();
console.log(`Found ${pluginNames.length} plugins: ${pluginNames.join(", ")}\n`);

for (const pluginName of pluginNames) {
  const plugin = readPluginYaml(pluginName);
  console.log(`── ${plugin.name} v${plugin.version} ──`);

  // Copy skill files, cursor rules, and command files into plugin bundle.
  // Rules must run after skills because the cursor `.mdc` files are emitted
  // by build:skills, which is sequenced before build:plugins in `bun run build`.
  copySkillsToPlugin(pluginName, plugin);
  copyCursorSkillsToPlugin(pluginName, plugin);
  const cursorRuleCount = copyRulesToPlugin(pluginName, plugin);
  copyCommandsToPlugin(pluginName, plugin);

  // Generate per-platform plugin.json files
  for (const host of getMarketplaceHosts()) {
    const generator = GENERATORS[host.name];
    if (!generator) continue;

    const pluginJson = generator(plugin, { cursorRuleCount });
    const outputDir = path.join(PLUGINS_DIR, pluginName, host.pluginSubdir);
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, host.manifestFile);
    fs.writeFileSync(outputPath, JSON.stringify(pluginJson, null, 2) + "\n");
    console.log(`  GENERATED: ${path.relative(ROOT, outputPath)}`);
  }

  writeOpenCodeArtifacts(pluginName, plugin);
  writeGeminiArtifacts(pluginName, plugin);

  console.log("");
}

console.log("✓ Plugin generation complete.");
