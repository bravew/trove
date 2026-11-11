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
import { legacyCategorySelector, loadTaxonomy, pluginCategoryLabel } from "./lib/categories";
import { projectPluginLogo } from "./lib/plugin-logo";
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
import { checkGeneratedFreshness } from "./lib/generated-freshness";
import { isUnownedSupportName } from "./lib/support-files";

const ROOT = process.env.TROVE_GENERATOR_ROOT ?? path.resolve(import.meta.dir, "..");
const DRY_RUN = process.argv.includes("--dry-run");

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
 * Discovery metadata.
 *
 * The category comes from the plugin's own `plugin.yaml`, resolved to its
 * display label, so marketplace.yaml is not a second place to author it.
 * `keywords` still come from the marketplace entry's tags. `roles` stays out:
 * it is a Trove concept the CLI reads from catalog.json, and no host acts on it.
 *
 * An external entry keeps its own category, since Trove does not author it.
 */
function entryCategoryLabel(entry: MarketplaceYaml["plugins"][number]): string | undefined {
  if (typeof entry.source === "string") {
    return pluginCategoryLabel(loadPluginYaml(entry.source)?.category, ROOT);
  }
  return entry.category;
}

function discoveryMetadata(entry: MarketplaceYaml["plugins"][number]): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const category = entryCategoryLabel(entry);
  if (category) meta.category = category;
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
        const pluginYaml = typeof entry.source === "string" ? loadPluginYaml(entry.source) : null;
        const logo = platformName === "cursor" && pluginYaml
          ? projectPluginLogo(path.join(ROOT, "plugins", entry.source as string), pluginYaml).cursorLogo
          : undefined;
        return {
          name: entry.name,
          source: `./plugins/${entry.source}`,
          description: entry.description,
          ...discoveryMetadata(entry),
          ...(logo ? { logo } : {}),
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
        category: entryCategoryLabel(entry) ?? "Productivity",
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
  logo?: string;
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
    let logo: string | undefined;

    if (isLocal) {
      const pluginYaml = loadPluginYaml(entry.source as string);
      if (pluginYaml) {
        logo = projectPluginLogo(path.join(ROOT, "plugins", entry.source as string), pluginYaml).cursorLogo;
        // Derive per-plugin version from the marketplace umbrella version
        // (matches gen-plugins.ts; pluginYaml.version is hardcoded "1.0.0"
        // and would otherwise freeze CLI display + future per-plugin
        // marketplace-entry versions at 1.0.0 forever).
        version = marketplace.metadata.version;
        if (pluginYaml.skills) {
          skillNames = pluginYaml.skills.map((s) => path.basename(s.path));
          const platformSet = new Set<string>();
          for (const skill of pluginYaml.skills) {
            for (const p of skill.platforms || ["claude", "cursor", "codex", "agents", "copilot"]) {
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
      // The legacy selector, not the display label: `trove list --category`
      // keeps matching the category a plugin had before the taxonomy.
      category: typeof entry.source === "string" ? legacyCategorySelector(entry.name) : entry.category,
      tags: entry.tags,
      roles: entry.roles,
      version,
      source: isLocal ? `./plugins/${entry.source}` : JSON.stringify(entry.source),
      ...(logo ? { logo } : {}),
      platforms,
      skills: skillNames,
      categoryId: typeof entry.source === "string" ? loadPluginYaml(entry.source)?.category : undefined,
      categoryLabel: entryCategoryLabel(entry),
      curated: entry.curated,
    };
  });
}

interface CatalogSkill {
  name: string;
  plugin: string;
  categoryId: string;
  categoryLabel: string;
  description: string;
  platforms: string[];
}

interface CatalogCategory {
  id: string;
  label: string;
  plugins: string[];
  skills: string[];
}

/**
 * The skill index and the categories that actually have something in them.
 * Descriptions come from the skill templates; a skill with no template gets
 * an empty description rather than failing the build.
 */
function catalogDiscovery(marketplace: MarketplaceYaml): { categories: CatalogCategory[]; skills: CatalogSkill[] } {
  const descriptions = new Map<string, string>();
  for (const template of findTemplates(path.join(ROOT, "skills"))) {
    const parsed = loadAndParseTemplate(template);
    descriptions.set(template.skillName, parsed.authoring.description.replace(/\s+/g, " ").trim());
  }

  const skills: CatalogSkill[] = [];
  const byCategory = new Map<string, CatalogCategory>();
  for (const entry of marketplace.plugins) {
    if (typeof entry.source !== "string") continue;
    const pluginYaml = loadPluginYaml(entry.source);
    if (!pluginYaml) continue;
    const pluginLabel = pluginCategoryLabel(pluginYaml.category, ROOT);
    if (pluginYaml.category && pluginLabel) {
      const bucket = byCategory.get(pluginYaml.category) ?? { id: pluginYaml.category, label: pluginLabel, plugins: [], skills: [] };
      bucket.plugins.push(entry.name);
      byCategory.set(pluginYaml.category, bucket);
    }
    for (const skill of pluginYaml.skills ?? []) {
      const name = path.basename(skill.path);
      if (!skill.category) continue;
      const label = pluginCategoryLabel(skill.category, ROOT);
      if (!label) continue;
      skills.push({
        name,
        plugin: entry.name,
        categoryId: skill.category,
        categoryLabel: label,
        description: descriptions.get(name) ?? "",
        platforms: skill.platforms ?? ["claude", "cursor", "codex", "agents", "copilot"],
      });
      const bucket = byCategory.get(skill.category) ?? { id: skill.category, label, plugins: [], skills: [] };
      bucket.skills.push(name);
      byCategory.set(skill.category, bucket);
    }
  }

  const categories = [...byCategory.values()]
    .map((category) => ({ ...category, plugins: category.plugins.sort(), skills: category.skills.sort() }))
    .sort((a, b) => a.label.localeCompare(b.label));
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { categories, skills };
}

/** Escape a value for a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/**
 * `docs/categories.md`: the assignment reference, generated from the same
 * resolver the manifests use so it cannot disagree with them.
 */
function renderCategoriesDoc(
  plugins: CatalogEntry[],
  discovery: { categories: CatalogCategory[]; skills: CatalogSkill[] },
): string {
  const taxonomy = loadTaxonomy(ROOT);
  const used = new Set(discovery.categories.map((category) => category.id));
  const lines: string[] = [
    "# Categories",
    "",
    "<!-- AUTO-GENERATED by `bun run build:marketplace` - do not edit directly -->",
    "",
    "Every Trove plugin and skill has one browsing category. Assignments are",
    "authored in each `plugins/<name>/plugin.yaml`; the vocabulary is",
    "`categories.yaml`. Browse them with `trove categories` and",
    "`trove list --skills --category=<id>`.",
    "",
    `The labels are the vocabulary observed in Claude Desktop on ${taxonomy.observedAt}.`,
    "They are Trove's own ids, not a vendor enum. The display label is projected to",
    "hosts whose documented contract accepts a free-form category string: the",
    "Claude, Cursor, and Copilot marketplace entries, both Codex category fields,",
    "and the legacy Copilot plugin manifest. Skills carry it as",
    "`metadata.trove-category` where their host keeps metadata. No host is claimed",
    "to filter on these labels; that is verified separately in each client.",
    "",
    "## Plugins",
    "",
    "| Plugin | Category | Id | Legacy selector |",
    "| --- | --- | --- | --- |",
  ];
  for (const plugin of plugins) {
    if (!plugin.categoryId) continue;
    lines.push(`| ${plugin.name} | ${cell(plugin.categoryLabel ?? "")} | \`${plugin.categoryId}\` | \`${plugin.category ?? ""}\` |`);
  }
  lines.push(
    "",
    "A legacy selector is the category a plugin had before this taxonomy.",
    "`trove list --category=<selector>` still returns exactly that plugin, so",
    "`workflow` and `development` stay distinct even though both are Engineering.",
    "",
    "## Skills by category",
    "",
  );
  for (const category of discovery.categories) {
    if (category.skills.length === 0) continue;
    lines.push(`### ${category.label} (\`${category.id}\`)`, "");
    lines.push("| Skill | Plugin |", "| --- | --- |");
    for (const skill of discovery.skills.filter((entry) => entry.categoryId === category.id)) {
      lines.push(`| ${skill.name} | ${skill.plugin} |`);
    }
    lines.push("");
  }
  const unused = taxonomy.categories.filter((category) => !used.has(category.id));
  lines.push(
    "## Unused categories",
    "",
    `${unused.length} categories in the vocabulary have no plugin or skill yet:`,
    "",
    unused.map((category) => `${category.label} (\`${category.id}\`)`).join(", ") + ".",
    "",
  );
  return lines.join("\n");
}

// ─── Marketplace generators per host ────────────────────────

// Codex uses a different schema (see generateCodexMarketplace); cast away
// the MarketplaceJson return type for that one entry. Cursor still uses
// Claude-shaped marketplace.json.
const GENERATORS: Record<string, (m: MarketplaceYaml) => unknown> = {
  claude: generateClaudeMarketplace,
  cursor: (m) => generatePlatformMarketplace(m, "cursor"),
  codex: generateCodexMarketplace,
  copilot: (m) => generatePlatformMarketplace(m, "copilot"),
};

// ─── Main ───────────────────────────────────────────────────

const marketplace = loadMarketplaceYaml();
if (DRY_RUN) {
  const managed = [
    ".claude-plugin/marketplace.json",
    ".cursor-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
    ".github/plugin/marketplace.json",
    "catalog.json",
    "docs/categories.md",
    "output/codex/.agents/AGENTS.md",
    "output/codex/.agents/plugins",
    "output/agents",
  ];
  const stale = checkGeneratedFreshness({
    root: ROOT,
    scriptPath: import.meta.path,
    seedPaths: ["VERSION", "marketplace.yaml", "categories.yaml", "plugins", "skills", "output"],
    managedPaths: managed,
    cleanPaths: managed,
  });
  for (const file of stale) console.error(`STALE: ${file}`);
  if (stale.length > 0) process.exit(1);
  console.log("FRESH: marketplace artifacts");
  process.exit(0);
}
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
const discovery = catalogDiscovery(marketplace);
const catalogPath = path.join(ROOT, "catalog.json");
fs.writeFileSync(
  catalogPath,
  JSON.stringify({ plugins: catalog, categories: discovery.categories, skills: discovery.skills }, null, 2) + "\n",
);
console.log(`GENERATED: catalog.json`);

const categoriesDocPath = path.join(ROOT, "docs", "categories.md");
fs.mkdirSync(path.dirname(categoriesDocPath), { recursive: true });
fs.writeFileSync(categoriesDocPath, renderCategoriesDoc(catalog, discovery));
console.log(`GENERATED: docs/categories.md`);

// ─── Scoped AGENTS assembly ─────────────────────────────────
//
// AGENTS.md-style hosts emit a concise root index plus one scoped file per
// plugin. This lives here (not in gen-skills) because the assembly is
// inherently plugin-aware and gen-marketplace already loads plugin.yaml
// files for the marketplace catalog.

interface AgentsSection {
  skillName: string;
  sourceDirectory: string;
  description: string;
  body: string;
}

interface AgentsPluginArtifact {
  outputPath: string;
  content: string;
  pluginName: string;
  references: Array<{ source: string; destination: string }>;
}

function buildAgentsSection(template: TemplateFile, parsed: ParsedTemplate, host: HostConfig): AgentsSection {
  let body = parsed.body.replace(/^\n+/, "");
  body = applyContentRewrites(body, host);
  body = body
    .split("\n")
    .filter((line) => !line.startsWith("<!-- AUTO-GENERATED") && !line.startsWith("<!-- Regenerate:"))
    .join("\n")
    .trim();
  // Scoped files inline several skills whose reference filenames may collide.
  // Keep each reference tree intact and qualify links by the owning skill.
  body = body.replace(/\]\((?:\.\/)?references\//g, `](./skills/${template.skillName}/references/`);
  return {
    skillName: template.skillName,
    sourceDirectory: path.dirname(template.path),
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
): { rootArtifact: { outputPath: string; content: string }; pluginArtifacts: AgentsPluginArtifact[] } {
  const pluginArtifacts: AgentsPluginArtifact[] = [];
  const rootPluginSkills: Array<{ plugin: PluginInfo; sections: AgentsSection[] }> = [];
  for (const plugin of plugins) {
    const sectionsForPlugin: AgentsSection[] = [];
    for (const skill of plugin.yaml.skills ?? []) {
      const platforms = skill.platforms ?? ["claude", "cursor", "codex", "agents", "copilot"];
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
      references: sectionsForPlugin.flatMap((section) => {
        const source = path.join(section.sourceDirectory, "references");
        return fs.existsSync(source) ? [{
          source,
          destination: path.join(path.dirname(pluginAgentsPath), "skills", section.skillName, "references"),
        }] : [];
      }),
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
      for (const reference of p.references) {
        fs.cpSync(reference.source, reference.destination, {
          recursive: true,
          filter: (source) => !isUnownedSupportName(path.basename(source)),
        });
      }
      console.log(`GENERATED: ${path.relative(ROOT, p.outputPath)}`);
    }
  }
}

console.log("\n✓ Marketplace generation complete.");
