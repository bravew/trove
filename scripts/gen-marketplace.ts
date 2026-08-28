#!/usr/bin/env bun
/**
 * Stage 3: Generate per-platform marketplace.json catalogs.
 *
 * Pipeline:
 *   read marketplace.yaml → generate per-platform marketplace.json
 *   validate all plugin references resolve correctly
 *   generate catalog.json for CLI tooling/search
 *
 * Usage:
 *   bun run build:marketplace
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import { ALL_HOSTS, getMarketplaceHosts } from "../hosts/index";
import type { HostConfig, MarketplaceYaml, MarketplaceJson, PluginYaml } from "../hosts/types";
import {
  findTemplates,
  loadAndParseTemplate,
  loadPlugins,
  buildSkillToPlugins,
  applyContentRewrites,
  type ParsedTemplate,
  type PluginInfo,
  type PluginAttachment,
  type TemplateFile,
} from "./lib/skill-parser";

const ROOT = path.resolve(import.meta.dir, "..");

// ─── Load marketplace.yaml ──────────────────────────────────

function loadMarketplaceYaml(): MarketplaceYaml {
  const yamlPath = path.join(ROOT, "marketplace.yaml");
  const content = fs.readFileSync(yamlPath, "utf-8");
  return YAML.parse(content) as MarketplaceYaml;
}

// ─── Load plugin.yaml for a local plugin ────────────────────

function loadPluginYaml(pluginName: string): PluginYaml | null {
  const yamlPath = path.join(ROOT, "plugins", pluginName, "plugin.yaml");
  if (!fs.existsSync(yamlPath)) return null;
  return YAML.parse(fs.readFileSync(yamlPath, "utf-8")) as PluginYaml;
}

// ─── Claude Code marketplace.json ───────────────────────────

// Plugin entries intentionally do NOT include a `skills` field. With
// `strict: true`, plugin.json is the authority — and per the marketplace
// docs (https://code.claude.com/docs/en/plugin-marketplaces), `skills`
// paths declared at the marketplace-entry level are resolved relative
// to the PLUGIN ROOT, not the marketplace root. Emitting paths like
// `./plugins/<plugin>/skills/...` here causes Claude Code to look for
// `<plugin-cache>/plugins/<plugin>/skills/...` (with a redundant
// `plugins/<plugin>/` segment) and fail with "Path not found".
// Anthropic's own claude-plugins-official marketplace omits this field
// for the same reason — plugin.json is the canonical skill manifest.

/**
 * Discovery metadata Trove already curates in `marketplace.yaml`.
 *
 * `category` and `keywords` are documented marketplace fields Claude Code uses
 * to organize and search plugins, and Trove has real values for both — they
 * were simply being dropped. `roles` stays out: it is a Trove concept the CLI
 * reads from catalog.json, and no host acts on it.
 */
function discoveryMetadata(entry: MarketplaceYaml["plugins"][number]): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (entry.category) meta.category = entry.category;
  if (entry.tags && entry.tags.length > 0) meta.keywords = entry.tags;
  return meta;
}

function generateClaudeMarketplace(marketplace: MarketplaceYaml): MarketplaceJson {
  const plugins = marketplace.plugins.map((entry) => {
    const isLocal = typeof entry.source === "string" && !entry.source.startsWith("http");

    if (isLocal) {
      return {
        name: entry.name,
        source: `./plugins/${entry.source}`,
        description: entry.description,
        ...discoveryMetadata(entry),
        strict: true,
      };
    }

    // External source (github, url, etc.)
    return {
      name: entry.name,
      source: entry.source as Record<string, unknown>,
      description: entry.description,
      ...discoveryMetadata(entry),
    };
  });

  return {
    name: marketplace.name,
    owner: marketplace.owner,
    metadata: {
      description: marketplace.metadata.description,
      version: marketplace.metadata.version,
    },
    plugins,
  };
}

// ─── Platform-filtered marketplace.json (Cursor, Codex, etc.) ─

function generatePlatformMarketplace(
  marketplace: MarketplaceYaml,
  platformName: string,
): MarketplaceJson {
  const plugins = marketplace.plugins
    .filter((entry) => {
      if (typeof entry.source !== "string") return true;
      const pluginYaml = loadPluginYaml(entry.source);
      if (!pluginYaml?.skills) return false;
      return pluginYaml.skills.some((s) => !s.platforms || s.platforms.includes(platformName));
    })
    .map((entry) => {
      const isLocal = typeof entry.source === "string" && !entry.source.startsWith("http");

      // No `skills` field on local entries — see comment on
      // generateClaudeMarketplace. Same Claude Code resolution rules apply
      // here for any host that consumes a marketplace.json shape.
      if (isLocal) {
        return {
          name: entry.name,
          source: `./plugins/${entry.source}`,
          description: entry.description,
          ...discoveryMetadata(entry),
        };
      }

      return {
        name: entry.name,
        source: entry.source as Record<string, unknown>,
        description: entry.description,
        ...discoveryMetadata(entry),
      };
    });

  return {
    name: marketplace.name,
    owner: marketplace.owner,
    metadata: {
      description: marketplace.metadata.description,
      version: marketplace.metadata.version,
    },
    plugins,
  };
}

// ─── Codex marketplace.json ─────────────────────────────────

/**
 * Codex's marketplace.json schema is fundamentally different from Claude's
 * (https://developers.openai.com/codex/plugins/build):
 *
 *   - Top-level `interface.displayName` (no `owner`/`metadata`)
 *   - Per-plugin `source` is ALWAYS an object: `{source: "local"|"github"|...,
 *     path|repo: ...}`. Bare-string sources (Claude's local format) cause
 *     the Codex TUI's `plugin/read` method to fail with
 *     "Plugin detail unavailable".
 *   - Per-plugin `policy: {installation, authentication}` is required —
 *     `installation: "AVAILABLE"` is what marks an entry as installable
 *     in the `/plugins` TUI.
 *   - Per-plugin `category` field (free-form string).
 *
 * Codex auto-discovers `$REPO_ROOT/.agents/plugins/marketplace.json` when
 * launched inside the marketplace repo, so committing this file is the
 * effective install path for users who clone Trove.
 */
function generateCodexMarketplace(marketplace: MarketplaceYaml): Record<string, unknown> {
  const plugins = marketplace.plugins
    .filter((entry) => {
      // Skip plugins with no codex-targeting skills (mirrors Cursor filter).
      if (typeof entry.source !== "string") return true;
      const pluginYaml = loadPluginYaml(entry.source);
      if (!pluginYaml?.skills) return false;
      return pluginYaml.skills.some((s) => !s.platforms || s.platforms.includes("codex"));
    })
    .map((entry) => {
      const isLocalString = typeof entry.source === "string" && !entry.source.startsWith("http");

      // Local sources: wrap bare string as Codex's source object.
      // External sources: pass through (already in object form, and Codex
      // accepts `source: "github"` etc.).
      const source = isLocalString
        ? { source: "local", path: `./plugins/${entry.source}` }
        : (entry.source as Record<string, unknown>);

      return {
        name: entry.name,
        source,
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL",
        },
        category: entry.category ?? "Productivity",
        description: entry.description,
      };
    });

  return {
    name: marketplace.name,
    interface: {
      displayName: marketplace.metadata.description,
    },
    plugins,
  };
}

// ─── Universal catalog.json (for CLI search) ────────────────

interface CatalogEntry {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  roles?: string[];
  version?: string;
  source: string;
  platforms: string[];
  skills: string[];
  curated?: boolean;
}

function generateCatalog(marketplace: MarketplaceYaml): CatalogEntry[] {
  return marketplace.plugins.map((entry) => {
    const isLocal = typeof entry.source === "string";
    let version: string | undefined;
    let platforms: string[] = [];
    let skillNames: string[] = [];

    if (isLocal) {
      const pluginYaml = loadPluginYaml(entry.source as string);
      if (pluginYaml) {
        // Derive per-plugin version from the marketplace umbrella version
        // (matches gen-plugins.ts; pluginYaml.version is hardcoded "1.0.0"
        // and would otherwise freeze CLI display + future per-plugin
        // marketplace-entry versions at 1.0.0 forever).
        version = marketplace.metadata.version;
        if (pluginYaml.skills) {
          skillNames = pluginYaml.skills.map((s) => path.basename(s.path));
          const platformSet = new Set<string>();
          for (const skill of pluginYaml.skills) {
            for (const p of skill.platforms || ["claude", "cursor", "codex", "agents"]) {
              platformSet.add(p);
            }
          }
          platforms = Array.from(platformSet);
        }
      }
    }

    return {
      name: entry.name,
      description: entry.description,
      category: entry.category,
      tags: entry.tags,
      roles: entry.roles,
      version,
      source: isLocal ? `./plugins/${entry.source}` : JSON.stringify(entry.source),
      platforms,
      skills: skillNames,
      curated: entry.curated,
    };
  });
}

// ─── Marketplace generators per host ────────────────────────

// Codex uses a different schema (see generateCodexMarketplace); cast away
// the MarketplaceJson return type for that one entry. Cursor still uses
// Claude-shaped marketplace.json.
const GENERATORS: Record<string, (m: MarketplaceYaml) => unknown> = {
  claude: generateClaudeMarketplace,
  cursor: (m) => generatePlatformMarketplace(m, "cursor"),
  codex: generateCodexMarketplace,
};

// ─── Main ───────────────────────────────────────────────────

const marketplace = loadMarketplaceYaml();
console.log(`Marketplace: ${marketplace.name} v${marketplace.metadata.version}`);
console.log(`Plugins: ${marketplace.plugins.length}\n`);

// Validate plugin references before generating output
let errors = 0;
for (const entry of marketplace.plugins) {
  if (typeof entry.source === "string") {
    const pluginDir = path.join(ROOT, "plugins", entry.source);
    if (!fs.existsSync(pluginDir)) {
      console.error(`ERROR: Plugin directory not found: plugins/${entry.source}`);
      errors++;
    } else if (!fs.existsSync(path.join(pluginDir, "plugin.yaml"))) {
      console.error(`ERROR: Missing plugin.yaml in plugins/${entry.source}`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} validation error(s) found. Aborting generation.`);
  process.exit(1);
}

// Generate per-platform marketplace.json
for (const host of getMarketplaceHosts()) {
  const generator = GENERATORS[host.name];
  if (!generator) continue;

  const marketplaceJson = generator(marketplace);
  const outputDir = path.join(ROOT, host.marketplaceSubdir);
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "marketplace.json");
  fs.writeFileSync(outputPath, JSON.stringify(marketplaceJson, null, 2) + "\n");
  console.log(`GENERATED: ${path.relative(ROOT, outputPath)}`);
}

// Generate universal catalog.json
const catalog = generateCatalog(marketplace);
const catalogPath = path.join(ROOT, "catalog.json");
fs.writeFileSync(catalogPath, JSON.stringify({ plugins: catalog }, null, 2) + "\n");
console.log(`GENERATED: catalog.json`);

// ─── Scoped AGENTS assembly ─────────────────────────────────
//
// AGENTS.md-style hosts emit a concise root index plus one scoped file per
// plugin. This lives here (not in gen-skills) because the assembly is
// inherently plugin-aware and gen-marketplace already loads plugin.yaml
// files for the marketplace catalog.

interface AgentsSection {
  skillName: string;
  description: string;
  body: string;
}

function buildAgentsSection(template: TemplateFile, parsed: ParsedTemplate, host: HostConfig): AgentsSection {
  let body = parsed.body.replace(/^\n+/, "");
  body = applyContentRewrites(body, host);
  body = body
    .split("\n")
    .filter((line) => !line.startsWith("<!-- AUTO-GENERATED") && !line.startsWith("<!-- Regenerate:"))
    .join("\n")
    .trim();
  return {
    skillName: template.skillName,
    description: parsed.authoring.description,
    body,
  };
}

function assembleScopedAgents(
  marketplaceName: string,
  plugins: PluginInfo[],
  skillToPlugins: Map<string, PluginAttachment[]>,
  sections: Map<string, AgentsSection>,
  host: HostConfig,
): { rootArtifact: { outputPath: string; content: string }; pluginArtifacts: Array<{ outputPath: string; content: string; pluginName: string }> } {
  const pluginArtifacts: Array<{ outputPath: string; content: string; pluginName: string }> = [];
  const rootPluginSkills: Array<{ plugin: PluginInfo; sections: AgentsSection[] }> = [];
  for (const plugin of plugins) {
    const sectionsForPlugin: AgentsSection[] = [];
    for (const skill of plugin.yaml.skills ?? []) {
      const platforms = skill.platforms ?? ["claude", "cursor", "codex", "agents"];
      if (!platforms.includes(host.name)) continue;

      const skillName = path.basename(skill.path);
      const localTemplate = findPluginLocalSkillTemplate(plugin.name, skillName);
      if (localTemplate) {
        const parsed = loadAndParseTemplate(localTemplate);
        sectionsForPlugin.push(buildAgentsSection(localTemplate, parsed, host));
        continue;
      }

      const section = sections.get(skillName);
      if (section) sectionsForPlugin.push(section);
    }
    if (sectionsForPlugin.length === 0) continue;
    sectionsForPlugin.sort((a, b) => a.skillName.localeCompare(b.skillName));
    rootPluginSkills.push({ plugin, sections: sectionsForPlugin });
    const parts: string[] = [];
    parts.push(`# ${plugin.name}\n`);
    parts.push(`> ${plugin.description}\n`);
    parts.push(`<!-- AUTO-GENERATED by bun run build:marketplace — do not edit directly -->\n`);
    const anchor = sectionsForPlugin.find((section) => section.skillName.startsWith("using-"));
    if (anchor) {
      parts.push(
        `> Bootstrap: this plugin ships a discipline anchor at .agents/skills/${anchor.skillName}/SKILL.md. ` +
          `Load it before responding to any build, design, planning, review, or git prompt.\n`,
      );
    }
    parts.push(
      "Skills below are scoped to this plugin. Tools that consume nested AGENTS.md " +
        "(GitHub Copilot, Windsurf, Aider, JetBrains Junie, …) load the nearest file, " +
        "so dropping this plugin into a project surfaces only its own guidance.\n",
    );
    for (const section of sectionsForPlugin) {
      parts.push("---\n");
      parts.push(`## ${section.skillName}\n`);
      if (section.description) parts.push(`*${section.description}*\n`);
      if (section.body) parts.push(section.body);
    }
    const content = parts.join("\n").trimEnd() + "\n";
    const pluginAgentsPath = host.name === "codex"
      ? path.join(ROOT, "output", host.name, ".agents", "plugins", plugin.name, "AGENTS.md")
      : path.join(ROOT, "output", host.name, "plugins", plugin.name, "AGENTS.md");
    pluginArtifacts.push({
      pluginName: plugin.name,
      outputPath: pluginAgentsPath,
      content,
    });
  }

  // Root index. Stays index-shaped — tests pin a generous line ceiling.
  const rootParts: string[] = [];
  rootParts.push(`# ${marketplaceName} — Agent Instructions\n`);
  rootParts.push(`<!-- AUTO-GENERATED by bun run build:marketplace — do not edit directly -->\n`);
  rootParts.push(
    "Per-plugin guidance lives next to each plugin. AGENTS.md-aware tools " +
      "(GitHub Copilot, Windsurf, Aider, JetBrains Junie) use nearest-scope " +
      "precedence, so the closer file wins.\n",
  );
  rootParts.push("## Plugins\n");
  for (const { plugin, sections: sectionsForPlugin } of rootPluginSkills) {
    const skillNames = sectionsForPlugin.map((s) => `\`${s.skillName}\``).join(", ");
    rootParts.push(`- **${plugin.name}** — ${plugin.description}`);
    rootParts.push(`  See [\`plugins/${plugin.name}/AGENTS.md\`](./plugins/${plugin.name}/AGENTS.md). Skills: ${skillNames}.`);
  }
  rootParts.push("");

  return {
    rootArtifact: {
      outputPath: host.name === "codex"
        ? path.join(ROOT, "output", host.name, ".agents", "AGENTS.md")
        : path.join(ROOT, "output", host.name, "AGENTS.md"),
      content: rootParts.join("\n"),
    },
    pluginArtifacts,
  };
}

function findPluginLocalSkillTemplate(pluginName: string, skillName: string): TemplateFile | null {
  const skillDir = path.join(ROOT, "plugins", pluginName, "skills", skillName);
  const tmpl = path.join(skillDir, "SKILL.md.tmpl");
  if (fs.existsSync(tmpl)) return { path: tmpl, skillName };
  const md = path.join(skillDir, "SKILL.md");
  if (fs.existsSync(md)) return { path: md, skillName };
  return null;
}

const agentsHosts = ALL_HOSTS.filter((h) => h.projections.includes("agents-section"));
if (agentsHosts.length > 0) {
  const templates = findTemplates();
  const plugins = loadPlugins();
  const skillToPlugins = buildSkillToPlugins(plugins);

  for (const host of agentsHosts) {
    if (host.agentsScope && host.agentsScope !== "scoped") continue;

    // Wipe the prior scoped AGENTS output so renamed/removed plugins don't
    // leave orphan files behind.
    const pluginsRoot = host.name === "codex"
      ? path.join(ROOT, "output", host.name, ".agents", "plugins")
      : path.join(ROOT, "output", host.name, "plugins");
    if (fs.existsSync(pluginsRoot)) fs.rmSync(pluginsRoot, { recursive: true, force: true });

    const sections = new Map<string, AgentsSection>();
    for (const template of templates) {
      try {
        const parsed = loadAndParseTemplate(template);
        const section = buildAgentsSection(template, parsed, host);
        sections.set(section.skillName, section);
      } catch (e) {
        console.error(`ERROR (${host.name} agents): ${path.relative(ROOT, template.path)}: ${(e as Error).message}`);
      }
    }

    const { rootArtifact, pluginArtifacts } = assembleScopedAgents(
      marketplace.name,
      plugins,
      skillToPlugins,
      sections,
      host,
    );

    fs.mkdirSync(path.dirname(rootArtifact.outputPath), { recursive: true });
    fs.writeFileSync(rootArtifact.outputPath, rootArtifact.content);
    console.log(`GENERATED: ${path.relative(ROOT, rootArtifact.outputPath)}`);

    for (const p of pluginArtifacts) {
      fs.mkdirSync(path.dirname(p.outputPath), { recursive: true });
      fs.writeFileSync(p.outputPath, p.content);
      console.log(`GENERATED: ${path.relative(ROOT, p.outputPath)}`);
    }
  }
}

console.log("\n✓ Marketplace generation complete.");
