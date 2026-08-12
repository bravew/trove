/**
 * Shared skill-template parsing and projection helpers.
 *
 * Both `gen-skills.ts` and `gen-marketplace.ts` consume canonical skill
 * templates: the former emits per-host skill / rule artifacts, the latter
 * assembles scoped AGENTS.md output. They share frontmatter parsing and
 * content rewriting, so the logic lives here.
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import type { HostConfig, PluginYaml } from "../../hosts/types";
import { resolvers, makeBaseContext } from "../resolvers/index";
import type { ResolverContext, SkillFrontmatterV2, SkillManifest } from "../resolvers/types";

export const ROOT = path.resolve(import.meta.dir, "../..");

export const GENERATED_HEADER =
  `<!-- AUTO-GENERATED from {{SOURCE}} — do not edit directly -->\n` +
  `<!-- Regenerate: bun run build:skills -->\n`;

// ─── Template discovery ─────────────────────────────────────

export interface TemplateFile {
  /** Absolute path to the `.tmpl` file. */
  path: string;
  /** Skill directory basename (e.g., `trove-python`). */
  skillName: string;
}

export function findTemplates(skillsDir: string = path.join(ROOT, "skills")): TemplateFile[] {
  const templates: TemplateFile[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        walk(full);
      } else if (entry.name.endsWith(".tmpl")) {
        templates.push({ path: full, skillName: path.basename(path.dirname(full)) });
      }
    }
  }

  walk(skillsDir);
  return templates;
}

// ─── Plugin discovery ──────────────────────────────────────

export interface PluginInfo {
  name: string;
  description: string;
  yaml: PluginYaml;
}

export function loadPlugins(pluginsDir: string = path.join(ROOT, "plugins")): PluginInfo[] {
  if (!fs.existsSync(pluginsDir)) return [];
  const plugins: PluginInfo[] = [];
  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(pluginsDir, entry.name, "plugin.yaml");
    if (!fs.existsSync(yamlPath)) continue;
    const yaml = YAML.parse(fs.readFileSync(yamlPath, "utf-8")) as PluginYaml;
    plugins.push({ name: entry.name, description: yaml.description, yaml });
  }
  // `fs.readdirSync` is filesystem-ordered (APFS sorts alphabetically, ext4 does
  // not), so sort by name for deterministic output across CI and dev machines.
  plugins.sort((a, b) => a.name.localeCompare(b.name));
  return plugins;
}

export interface PluginAttachment {
  pluginName: string;
  pluginDescription: string;
  /** Platforms this skill is enabled for in the owning plugin. */
  platforms: string[];
}

/**
 * Build a `skill-name → [plugins]` map. A skill is generally owned by one
 * plugin, but the data structure tolerates multi-owner cases.
 */
export function buildSkillToPlugins(plugins: PluginInfo[]): Map<string, PluginAttachment[]> {
  const map = new Map<string, PluginAttachment[]>();
  for (const plugin of plugins) {
    for (const skill of plugin.yaml.skills ?? []) {
      const skillName = path.basename(skill.path);
      const platforms = skill.platforms ?? ["claude", "cursor", "codex", "agents"];
      const attachment: PluginAttachment = {
        pluginName: plugin.name,
        pluginDescription: plugin.description,
        platforms,
      };
      const existing = map.get(skillName);
      if (existing) existing.push(attachment);
      else map.set(skillName, [attachment]);
    }
  }
  return map;
}

// ─── Placeholder resolution ─────────────────────────────────

/**
 * Expand `{{PLACEHOLDER}}` tokens by dispatching to the typed resolver
 * registry. Today every resolver returns `mode: "inline"` and the value
 * is spliced into the body. `sidecar` and `metadata` modes are
 * protocol-supported (see scripts/resolvers/types.ts) but no host emits
 * them yet — when P3+ wires those projections through, this is where the
 * branch will live.
 */
export function resolvePlaceholders(
  content: string,
  tmplPath: string,
  partialContext?: Partial<ResolverContext>,
): string {
  const relPath = path.relative(ROOT, tmplPath);
  const defaults = makeBaseContext();
  const baseCtx: Pick<ResolverContext, "marketplaceVersion" | "projectRoot"> = {
    marketplaceVersion: partialContext?.marketplaceVersion ?? defaults.marketplaceVersion,
    projectRoot: partialContext?.projectRoot ?? defaults.projectRoot,
  };

  return content.replace(/\{\{(\w+(?::[^}]+)?)\}\}/g, (_match, fullKey: string) => {
    const parts = fullKey.split(":");
    const resolverName = parts[0];
    const args = parts.slice(1);
    const resolver = resolvers[resolverName];
    if (!resolver) {
      throw new Error(`Unknown placeholder {{${resolverName}}} in ${relPath}`);
    }
    const ctx: ResolverContext = {
      ...baseCtx,
      skill: partialContext?.skill,
      host: partialContext?.host,
      args: args.length > 0 ? args : undefined,
    };
    const result = resolver(ctx);
    return result.value;
  });
}

// ─── Frontmatter parsing ────────────────────────────────────

export interface ParsedTemplate {
  /** Full template content (post-placeholder-resolution). */
  resolved: string;
  /** Raw frontmatter text (between the `---` markers), without delimiters. */
  rawFrontmatter: string;
  /** Body after the closing `---`, with leading newline preserved. */
  body: string;
  name: string;
  description: string;
  /**
   * Activation globs. Reads `activation.globs` (v2 canonical) and falls
   * back to legacy `paths:` when v2 is absent.
   */
  paths: string[];
  userInvocable: boolean;
  /** Parsed v2 fields (best-effort, partial when frontmatter is incomplete). */
  v2: SkillFrontmatterV2;
}

function parseV2(parsed: Record<string, unknown>): SkillFrontmatterV2 {
  const v2: SkillFrontmatterV2 = {};
  if (typeof parsed.version === "string") v2.version = parsed.version.trim();
  if (typeof parsed["preamble-tier"] === "number") v2.preambleTier = parsed["preamble-tier"] as number;
  if (Array.isArray(parsed.triggers)) {
    v2.triggers = (parsed.triggers as unknown[]).filter((t): t is string => typeof t === "string");
  }
  if (parsed.activation && typeof parsed.activation === "object" && !Array.isArray(parsed.activation)) {
    const act = parsed.activation as { globs?: unknown; manual?: unknown };
    const out: { globs?: string[]; manual?: boolean } = {};
    if (Array.isArray(act.globs)) {
      out.globs = (act.globs as unknown[]).filter((g): g is string => typeof g === "string");
    }
    if (typeof act.manual === "boolean") out.manual = act.manual;
    v2.activation = out;
  }
  if (Array.isArray(parsed["allowed-tools"])) {
    v2.allowedTools = (parsed["allowed-tools"] as unknown[]).filter((t): t is string => typeof t === "string");
  }
  if (Array.isArray(parsed["benefits-from"])) {
    v2.benefitsFrom = (parsed["benefits-from"] as unknown[]).filter((b): b is string => typeof b === "string");
  }
  if (parsed["host-overrides"] && typeof parsed["host-overrides"] === "object" && !Array.isArray(parsed["host-overrides"])) {
    v2.hostOverrides = parsed["host-overrides"] as Record<string, Record<string, unknown>>;
  }
  if (typeof parsed.paths === "string") v2.paths = parsed.paths;
  if (typeof parsed["user-invocable"] === "boolean") v2.userInvocable = parsed["user-invocable"];
  return v2;
}

export function parseTemplate(resolved: string): ParsedTemplate {
  const empty = (): ParsedTemplate => ({
    resolved,
    rawFrontmatter: "",
    body: resolved,
    name: "",
    description: "",
    paths: [],
    userInvocable: false,
    v2: {},
  });

  const fmStart = resolved.indexOf("---\n");
  if (fmStart !== 0) return empty();
  const fmEnd = resolved.indexOf("\n---", fmStart + 4);
  if (fmEnd === -1) return empty();

  const rawFrontmatter = resolved.slice(fmStart + 4, fmEnd);
  const body = resolved.slice(fmEnd + 4);

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (YAML.parse(rawFrontmatter) as Record<string, unknown>) ?? {};
  } catch {
    parsed = {};
  }

  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
  const v2 = parseV2(parsed);

  // Activation globs come from v2 `activation.globs` first, with legacy
  // string `paths:` as a fallback during the migration.
  let paths: string[] = [];
  if (v2.activation?.globs && v2.activation.globs.length > 0) {
    paths = v2.activation.globs;
  } else if (typeof parsed.paths === "string") {
    paths = parsed.paths.split(",").map((p) => p.trim()).filter(Boolean);
  } else if (Array.isArray(parsed.paths)) {
    paths = (parsed.paths as unknown[]).filter((p): p is string => typeof p === "string");
  }

  const userInvocable = parsed["user-invocable"] === true;

  return { resolved, rawFrontmatter, body, name, description, paths, userInvocable, v2 };
}

/**
 * Load and parse a template, threading the resolved frontmatter back into
 * placeholder resolution so context-aware resolvers (like {{PREAMBLE}}'s
 * `preamble-tier` lookup) see the skill's metadata.
 */
export function loadAndParseTemplate(template: TemplateFile): ParsedTemplate {
  const tmplContent = fs.readFileSync(template.path, "utf-8");

  // Two-pass: first parse only the frontmatter (placeholders inside the
  // frontmatter aren't supported), then resolve the body with the parsed
  // skill manifest in context. This lets resolvers like {{PREAMBLE}} read
  // `preamble-tier:` from frontmatter without themselves being recursive.
  const fmStart = tmplContent.indexOf("---\n");
  const fmEnd = fmStart === 0 ? tmplContent.indexOf("\n---", fmStart + 4) : -1;
  const rawFrontmatterText = fmStart === 0 && fmEnd !== -1 ? tmplContent.slice(fmStart + 4, fmEnd) : "";
  let manifest: SkillManifest | undefined;
  if (rawFrontmatterText) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = (YAML.parse(rawFrontmatterText) as Record<string, unknown>) ?? {};
    } catch {
      parsed = {};
    }
    manifest = {
      name: typeof parsed.name === "string" ? parsed.name.trim() : "",
      description: typeof parsed.description === "string" ? parsed.description.trim() : "",
      templatePath: template.path,
      skillDir: path.dirname(template.path),
      rawFrontmatter: rawFrontmatterText,
      v2: parseV2(parsed),
    };
  }

  const resolved = resolvePlaceholders(tmplContent, template.path, { skill: manifest });
  return parseTemplate(resolved);
}

// ─── Frontmatter / content rewriting ────────────────────────

function stripFrontmatterFields(rawFrontmatter: string, stripFields: string[]): string {
  let lines = rawFrontmatter.split("\n");
  for (const field of stripFields) {
    const filtered: string[] = [];
    let skipping = false;
    for (const line of lines) {
      if (line.startsWith(`${field}:`)) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (line === "" || /^\s/.test(line)) continue;
        skipping = false;
      }
      filtered.push(line);
    }
    lines = filtered;
  }
  return lines.join("\n");
}

export function applyHostFrontmatter(content: string, host: HostConfig): string {
  if (host.frontmatter.mode === "keep") return content;

  const fmStart = content.indexOf("---\n");
  if (fmStart !== 0) return content;
  const fmEnd = content.indexOf("\n---", fmStart + 4);
  if (fmEnd === -1) return content;

  const raw = content.slice(fmStart + 4, fmEnd);
  const body = content.slice(fmEnd + 4);

  let updated = stripFrontmatterFields(raw, host.frontmatter.stripFields);

  for (const [from, to] of Object.entries(host.frontmatter.renameFields)) {
    updated = updated
      .split("\n")
      .map((line) => (line.startsWith(`${from}:`) ? line.replace(`${from}:`, `${to}:`) : line))
      .join("\n");
  }

  return `---\n${updated}\n---${body}`;
}

export function applyContentRewrites(content: string, host: HostConfig): string {
  for (const rewrite of host.contentRewrites) {
    content = content.replaceAll(rewrite.from, rewrite.to);
  }
  return content;
}

export function injectGeneratedHeader(content: string, sourceFile: string): string {
  const header = GENERATED_HEADER.replace("{{SOURCE}}", sourceFile);
  const fmCloseIdx = content.indexOf("\n---", 4);
  if (fmCloseIdx !== -1) {
    const insertAt = content.indexOf("\n", fmCloseIdx + 1) + 1;
    return content.slice(0, insertAt) + header + content.slice(insertAt);
  }
  return header + content;
}

export function flattenDescription(description: string): string {
  return description.replace(/\s+/g, " ").trim();
}
