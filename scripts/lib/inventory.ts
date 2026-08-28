import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import { ALL_HOSTS } from "../../hosts/index";
import type { MarketplaceYaml, PluginYaml } from "../../hosts/types";
import { ROOT, findTemplates, loadPlugins } from "./skill-parser";

/**
 * The version plugins actually ship with. `gen-plugins` stamps every generated
 * manifest from this file, so reporting anything else here would show users a
 * version no installed plugin has.
 */
const SHIPPED_VERSION = fs.readFileSync(path.join(ROOT, "VERSION"), "utf-8").trim();

const DEFAULT_SKILL_PLATFORMS = ["claude", "cursor", "codex", "agents"];

export interface SkillDeprecationWindow {
  until?: string;
  reason?: string;
  replacement?: string;
}

export interface SkillRegistration {
  skill: string;
  plugin: string;
  path: string;
  platforms: string[];
  deprecation?: SkillDeprecationWindow;
}

export interface InventoryFinding {
  severity: "error" | "warning";
  message: string;
}

export interface UpgradeInventory {
  schemaVersion: 1;
  counts: {
    canonicalSkills: number;
    pluginLocalAliases: number;
    plugins: number;
    marketplaceEntries: number;
    commands: number;
    hooks: number;
    agents: number;
    mcpServers: number;
    hostProjections: number;
  };
  canonicalSkills: Array<{
    name: string;
    category: string;
    templatePath: string;
  }>;
  pluginLocalAliases: Array<{
    name: string;
    plugin: string;
    templatePath: string;
    canonicalSkillExists: boolean;
  }>;
  plugins: Array<{
    name: string;
    path: string;
    version: string;
    roles: string[];
    platforms: string[];
    skills: SkillRegistration[];
    commands: Array<{ name: string; path: string; platforms: string[] }>;
    hooks: Array<{ event: string; matcher?: string; command: string }>;
    agents: Array<{ name: string; path: string }>;
    mcpServers: string[];
  }>;
  marketplaceEntries: Array<{
    name: string;
    source: string | Record<string, unknown>;
    curated: boolean;
    roles: string[];
  }>;
  hostProjections: Array<{
    name: string;
    displayName: string;
    projections: string[];
    skillOutputDir?: string;
    ruleOutputDir?: string;
    pluginSubdir: string;
    manifestFile: string;
    marketplaceSubdir: string;
    features: Record<string, boolean>;
  }>;
}

function rel(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function pluginRelPath(pluginName: string, entryPath: string): string {
  return `plugins/${pluginName}/${entryPath.replace(/^\.\//, "")}`;
}

function sorted<T>(items: T[], by: (item: T) => string): T[] {
  return [...items].sort((a, b) => by(a).localeCompare(by(b)));
}

function deprecationFrom(value: unknown): SkillDeprecationWindow | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const deprecation: SkillDeprecationWindow = {};
  if (typeof raw.until === "string") deprecation.until = raw.until;
  if (typeof raw.reason === "string") deprecation.reason = raw.reason;
  if (typeof raw.replacement === "string") deprecation.replacement = raw.replacement;
  return deprecation;
}

export function hasExplicitDeprecationWindow(registration: SkillRegistration): boolean {
  const deprecation = registration.deprecation;
  return (
    typeof deprecation?.until === "string" &&
    deprecation.until.trim().length > 0 &&
    typeof deprecation.reason === "string" &&
    deprecation.reason.trim().length > 0
  );
}

export function collectSkillRegistrations(root: string = ROOT): SkillRegistration[] {
  const plugins = loadPlugins(path.join(root, "plugins"));
  const registrations: SkillRegistration[] = [];

  for (const plugin of plugins) {
    for (const skill of plugin.yaml.skills ?? []) {
      const entry = skill as NonNullable<PluginYaml["skills"]>[number] & {
        deprecation?: SkillDeprecationWindow;
      };
      const skillName = path.basename(entry.path);
      registrations.push({
        skill: skillName,
        plugin: plugin.name,
        path: pluginRelPath(plugin.name, entry.path),
        platforms: entry.platforms ?? DEFAULT_SKILL_PLATFORMS,
        deprecation: deprecationFrom(entry.deprecation),
      });
    }
  }

  return sorted(registrations, (registration) => `${registration.skill}:${registration.plugin}`);
}

export function findDuplicateSkillRegistrationFindings(
  registrations: SkillRegistration[],
): InventoryFinding[] {
  const bySkill = new Map<string, SkillRegistration[]>();
  for (const registration of registrations) {
    const existing = bySkill.get(registration.skill);
    if (existing) existing.push(registration);
    else bySkill.set(registration.skill, [registration]);
  }

  const findings: InventoryFinding[] = [];
  for (const [skill, owners] of bySkill) {
    if (owners.length < 2) continue;

    const invalidDeprecations = owners.filter(
      (owner) => owner.deprecation !== undefined && !hasExplicitDeprecationWindow(owner),
    );
    for (const owner of invalidDeprecations) {
      findings.push({
        severity: "error",
        message: `${skill}: ${owner.plugin} declares a deprecation but must include non-empty deprecation.until and deprecation.reason`,
      });
    }

    const activeOwners = owners.filter((owner) => !hasExplicitDeprecationWindow(owner));
    if (activeOwners.length !== 1) {
      findings.push({
        severity: "error",
        message:
          `${skill}: duplicate first-party skill registration must have exactly one active owner and ` +
          `explicit deprecation windows for all aliases; owners: ` +
          owners.map((owner) => owner.plugin).join(", "),
      });
    }
  }

  return findings;
}

function collectCanonicalSkills(root: string): UpgradeInventory["canonicalSkills"] {
  const skillsRoot = path.join(root, "skills");
  return sorted(
    findTemplates(skillsRoot).map((template) => {
      const skillDir = path.dirname(template.path);
      const parent = path.basename(path.dirname(skillDir));
      return {
        name: template.skillName,
        category: parent,
        templatePath: rel(root, template.path),
      };
    }),
    (skill) => skill.name,
  );
}

function collectPluginLocalAliases(
  root: string,
  canonicalSkillNames: Set<string>,
): UpgradeInventory["pluginLocalAliases"] {
  const aliases: UpgradeInventory["pluginLocalAliases"] = [];
  const pluginsRoot = path.join(root, "plugins");
  if (!fs.existsSync(pluginsRoot)) return aliases;

  for (const pluginEntry of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!pluginEntry.isDirectory()) continue;
    const localSkillsRoot = path.join(pluginsRoot, pluginEntry.name, "skills");
    if (!fs.existsSync(localSkillsRoot)) continue;

    for (const skillEntry of fs.readdirSync(localSkillsRoot, { withFileTypes: true })) {
      if (!skillEntry.isDirectory()) continue;
      const tmplPath = path.join(localSkillsRoot, skillEntry.name, "SKILL.md.tmpl");
      if (!fs.existsSync(tmplPath)) continue;
      aliases.push({
        name: skillEntry.name,
        plugin: pluginEntry.name,
        templatePath: rel(root, tmplPath),
        canonicalSkillExists: canonicalSkillNames.has(skillEntry.name),
      });
    }
  }

  return sorted(aliases, (alias) => `${alias.plugin}:${alias.name}`);
}

function collectMarketplaceEntries(root: string): UpgradeInventory["marketplaceEntries"] {
  const yamlPath = path.join(root, "marketplace.yaml");
  if (!fs.existsSync(yamlPath)) return [];
  const marketplace = YAML.parse(fs.readFileSync(yamlPath, "utf-8")) as MarketplaceYaml;
  return sorted(
    (marketplace.plugins ?? []).map((plugin) => ({
      name: plugin.name,
      source: plugin.source,
      curated: plugin.curated === true,
      roles: plugin.roles ?? [],
    })),
    (plugin) => plugin.name,
  );
}

function collectPlugins(
  root: string,
  registrations: SkillRegistration[],
): UpgradeInventory["plugins"] {
  const plugins = loadPlugins(path.join(root, "plugins"));
  return plugins.map((plugin) => {
    const skills = registrations.filter((registration) => registration.plugin === plugin.name);
    const commands = (plugin.yaml.commands ?? []).map((command) => ({
      name: path.basename(command.path).replace(/\.md$/, ""),
      path: pluginRelPath(plugin.name, command.path),
      platforms: command.platforms ?? ["claude"],
    }));
    const hooks = Object.entries(plugin.yaml.hooks ?? {}).flatMap(([event, entries]) =>
      entries.map((hook) => ({
        event,
        matcher: hook.matcher,
        command: hook.command,
      })),
    );
    const agents = (plugin.yaml.agents ?? []).map((agent) => ({
      name: path.basename(agent.path).replace(/\.md$/, ""),
      path: pluginRelPath(plugin.name, agent.path),
    }));

    return {
      name: plugin.name,
      path: `plugins/${plugin.name}`,
      version: SHIPPED_VERSION,
      roles: plugin.yaml.roles ?? [],
      platforms: Object.keys(plugin.yaml.platforms ?? {}).sort(),
      skills,
      commands: sorted(commands, (command) => command.name),
      hooks: sorted(hooks, (hook) => `${hook.event}:${hook.command}`),
      agents: sorted(agents, (agent) => agent.name),
      mcpServers: Object.keys(plugin.yaml.mcp_servers ?? {}).sort(),
    };
  });
}

function collectHostProjections(): UpgradeInventory["hostProjections"] {
  return ALL_HOSTS.map((host) => ({
    name: host.name,
    displayName: host.displayName,
    projections: host.projections,
    skillOutputDir: host.skillOutputDir,
    ruleOutputDir: host.ruleOutputDir,
    pluginSubdir: host.pluginSubdir,
    manifestFile: host.manifestFile,
    marketplaceSubdir: host.marketplaceSubdir,
    features: host.features,
  }));
}

export function collectInventory(root: string = ROOT): UpgradeInventory {
  const canonicalSkills = collectCanonicalSkills(root);
  const canonicalSkillNames = new Set(canonicalSkills.map((skill) => skill.name));
  const pluginLocalAliases = collectPluginLocalAliases(root, canonicalSkillNames);
  const registrations = collectSkillRegistrations(root);
  const plugins = collectPlugins(root, registrations);
  const marketplaceEntries = collectMarketplaceEntries(root);
  const hostProjections = collectHostProjections();

  const commands = plugins.reduce((sum, plugin) => sum + plugin.commands.length, 0);
  const hooks = plugins.reduce((sum, plugin) => sum + plugin.hooks.length, 0);
  const agents = plugins.reduce((sum, plugin) => sum + plugin.agents.length, 0);
  const mcpServers = plugins.reduce((sum, plugin) => sum + plugin.mcpServers.length, 0);

  return {
    schemaVersion: 1,
    counts: {
      canonicalSkills: canonicalSkills.length,
      pluginLocalAliases: pluginLocalAliases.length,
      plugins: plugins.length,
      marketplaceEntries: marketplaceEntries.length,
      commands,
      hooks,
      agents,
      mcpServers,
      hostProjections: hostProjections.length,
    },
    canonicalSkills,
    pluginLocalAliases,
    plugins,
    marketplaceEntries,
    hostProjections,
  };
}

export function formatInventory(inventory: UpgradeInventory): string {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}
