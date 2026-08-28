#!/usr/bin/env bun
/**
 * Validate marketplace structure, plugin manifests, and skill files.
 *
 * Checks:
 *   - marketplace.yaml schema and references
 *   - plugin.yaml schema for each plugin
 *   - SKILL.md.tmpl files parse correctly
 *   - No relative sources containing ".."
 *   - No secrets in plugin files
 *
 * Note: Generated file freshness is checked separately via
 *   bun run build:skills -- --dry-run
 *
 * Usage:
 *   bun run validate                    # Validate everything
 *   bun run validate -- --plugins       # Plugins only
 *   bun run validate -- --marketplace   # Marketplace only
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import { ALL_HOSTS } from "../hosts/index";
import { projectFrontmatter, toAuthoringSkill } from "./lib/projection";
import { lintDecisionGates } from "./lib/decision-gate";
import { validateV2Frontmatter } from "./schema";
import { detectCycles, buildForwardGraph } from "./lib/dep-graph";
import { validateHooks } from "./lib/hooks";
import { validateMcpMetadata } from "./lib/mcp";
import {
  collectSkillRegistrations,
  findDuplicateSkillRegistrationFindings,
} from "./lib/inventory";
import { flattenSkillText, validateSkillBudget } from "./lib/skill-budget";
import {
  SPEC_REVISION,
  SPEC_URL,
  validateAgentSkillFrontmatter,
} from "./lib/agent-skills-spec";
import { checkOffline } from "./lib/upstream-sync";
import { loadUpstreamManifest, validateManifestInventory } from "./lib/upstream-manifest";

const ROOT = path.resolve(import.meta.dir, "..");
const PLUGINS_DIR = path.join(ROOT, "plugins");
const SKILLS_DIR = path.join(ROOT, "skills");

const args = process.argv.slice(2);
const pluginsOnly = args.includes("--plugins");
const marketplaceOnly = args.includes("--marketplace");
const validateAll = !pluginsOnly && !marketplaceOnly;

let errors = 0;
let warnings = 0;

function error(msg: string): void {
  console.error(`  ✗ ${msg}`);
  errors++;
}

function warn(msg: string): void {
  console.warn(`  ⚠ ${msg}`);
  warnings++;
}

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

// ─── Secret detection ───────────────────────────────────────

const SECRET_PATTERNS = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub Token", pattern: /gh[ps]_[A-Za-z0-9_]{36,}/ },
  { name: "Slack Token", pattern: /xox[baprs]-[0-9a-zA-Z-]+/ },
  { name: "Private Key", pattern: /-----BEGIN.*PRIVATE KEY-----/ },
  { name: "Generic Password", pattern: /password\s*[:=]\s*["'][^"']{8,}["']/i },
];

interface SessionStartAnchor {
  plugin: string;
  skill: string;
  bytes: number;
}

interface BootstrapAnchor {
  plugin: string;
  skill: string;
  platforms: string[];
}

function scanForSecrets(filePath: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(ROOT, filePath);

  // Strip code blocks and inline code to avoid false positives on example patterns
  const stripped = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "");

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(stripped)) {
      error(`Possible ${name} found in ${relPath}`);
    }
  }
}

// ─── Marketplace validation ─────────────────────────────────

function validateMarketplace(): void {
  console.log("\n── Marketplace ──");
  const yamlPath = path.join(ROOT, "marketplace.yaml");

  if (!fs.existsSync(yamlPath)) {
    error("marketplace.yaml not found");
    return;
  }

  try {
    const content = fs.readFileSync(yamlPath, "utf-8");
    const marketplace = YAML.parse(content);

    // Required fields
    if (!marketplace.name) error("marketplace.yaml: missing 'name'");
    if (!marketplace.owner?.name) error("marketplace.yaml: missing 'owner.name'");
    if (!marketplace.metadata?.version) error("marketplace.yaml: missing 'metadata.version'");
    if (!marketplace.plugins?.length) error("marketplace.yaml: no plugins defined");

    // Plugin entries
    for (const plugin of marketplace.plugins || []) {
      if (!plugin.name) {
        error("marketplace.yaml: plugin entry missing 'name'");
        continue;
      }

      if (!plugin.source) {
        error(`marketplace.yaml: plugin '${plugin.name}' missing 'source'`);
      }

      if (!plugin.description) {
        warn(`marketplace.yaml: plugin '${plugin.name}' missing 'description'`);
      }

      // Validate local source references
      if (typeof plugin.source === "string") {
        if (plugin.source.includes("..")) {
          error(`marketplace.yaml: plugin '${plugin.name}' source contains '..': ${plugin.source}`);
        }

        const pluginDir = path.join(ROOT, "plugins", plugin.source);
        if (!fs.existsSync(pluginDir)) {
          error(`marketplace.yaml: plugin directory not found: plugins/${plugin.source}`);
        }
      }

      // Validate curated entries have SHA
      if (plugin.curated && typeof plugin.source === "object" && !plugin.source.sha) {
        warn(`marketplace.yaml: curated plugin '${plugin.name}' missing SHA pin`);
      }
    }

    ok(`marketplace.yaml: ${marketplace.plugins?.length || 0} plugins defined`);
  } catch (e) {
    error(`marketplace.yaml: YAML parse error: ${(e as Error).message}`);
  }
}

// ─── Plugin validation ──────────────────────────────────────

function validatePlugin(pluginName: string): void {
  console.log(`\n── Plugin: ${pluginName} ──`);
  const pluginDir = path.join(PLUGINS_DIR, pluginName);
  const yamlPath = path.join(pluginDir, "plugin.yaml");

  if (!fs.existsSync(yamlPath)) {
    error("plugin.yaml not found");
    return;
  }

  try {
    const content = fs.readFileSync(yamlPath, "utf-8");
    const plugin = YAML.parse(content);

    // Required fields
    if (!plugin.name) error("plugin.yaml: missing 'name'");
    // No `version:` here on purpose: generated manifests take their version
    // from the repository VERSION file, so a second one in plugin.yaml can
    // only ever drift out of date. See the plan's F8.
    if (plugin.version) {
      error(
        "plugin.yaml: remove 'version' — shipped plugin versions come from the VERSION file, " +
          "and a second source can only drift",
      );
    }
    if (!plugin.description) error("plugin.yaml: missing 'description'");

    // Naming convention: must start with trove-
    if (plugin.name && !plugin.name.startsWith("trove-")) {
      warn(`plugin.yaml: name '${plugin.name}' should start with 'trove-'`);
    }

    // Name: kebab-case only
    if (plugin.name && !/^[a-z][a-z0-9-]*$/.test(plugin.name)) {
      error(`plugin.yaml: name '${plugin.name}' must be lowercase kebab-case`);
    }

    // Version: semver

    // Skills validation
    if (plugin.skills?.length) {
      for (const skill of plugin.skills) {
        if (!skill.path) {
          error("plugin.yaml: skill entry missing 'path'");
          continue;
        }

        const skillName = path.basename(skill.path);
        if (skillName && !/^[a-z][a-z0-9-]*$/.test(skillName)) {
          error(`plugin.yaml: skill name '${skillName}' must be lowercase kebab-case`);
        }

        if (skillName.includes(":")) {
          error(`plugin.yaml: skill name '${skillName}' must not contain ':'`);
        }
      }

      ok(`plugin.yaml: ${plugin.skills.length} skills defined`);
    }

    // Commands validation
    if (plugin.commands?.length) {
      const commandsRoot = path.join(ROOT, "commands");
      for (const cmd of plugin.commands) {
        if (!cmd.path) {
          error("plugin.yaml: command entry missing 'path'");
          continue;
        }

        const cmdFilename = path.basename(cmd.path);

        // Must be .md file
        if (!cmdFilename.endsWith(".md")) {
          error(`plugin.yaml: command '${cmdFilename}' must be a .md file`);
        }

        // Command name (without .md) must be kebab-case
        const cmdName = cmdFilename.replace(/\.md$/, "");
        if (cmdName && !/^[a-z][a-z0-9-]*$/.test(cmdName)) {
          error(`plugin.yaml: command name '${cmdName}' must be lowercase kebab-case`);
        }

        // No prefix needed — plugin namespacing handles conflict avoidance
        // Warn if using a redundant prefix that duplicates the plugin name
        if (cmdName.startsWith(plugin.name + "-")) {
          warn(`plugin.yaml: command '${cmdName}' has redundant prefix — plugin namespace '${plugin.name}:' already prevents conflicts`);
        }

        // Source file must exist
        const srcPath = path.join(commandsRoot, cmdFilename);
        if (!fs.existsSync(srcPath)) {
          error(`plugin.yaml: command source not found: commands/${cmdFilename}`);
        } else {
          // Validate command file has frontmatter with description
          const content = fs.readFileSync(srcPath, "utf-8");
          if (!content.startsWith("---\n")) {
            error(`commands/${cmdFilename}: missing frontmatter (must start with ---)`);
          } else {
            const fmEnd = content.indexOf("\n---", 4);
            if (fmEnd !== -1) {
              const fm = content.slice(4, fmEnd);
              if (!fm.match(/^description:/m)) {
                error(`commands/${cmdFilename}: missing 'description' in frontmatter`);
              }
            }
          }

          // Secret scan
          scanForSecrets(srcPath);
        }
      }

      ok(`plugin.yaml: ${plugin.commands.length} commands defined`);
    }

    // Hook schema validation. validate.ts only flags structural issues;
    // hook semantics live in scripts/lib/hooks.ts.
    if (plugin.hooks !== undefined) {
      const findings = validateHooks(plugin.hooks, pluginDir);
      for (const f of findings) {
        if (f.severity === "error") error(`plugin.yaml: ${f.message}`);
        else warn(`plugin.yaml: ${f.message}`);
      }
      if (findings.filter((f) => f.severity === "error").length === 0) {
        const events = Object.keys(plugin.hooks ?? {});
        if (events.length > 0) ok(`plugin.yaml: ${events.length} hook event(s): ${events.join(", ")}`);
      }
    }

    if (plugin.bootstrap !== undefined) {
      if (typeof plugin.bootstrap !== "object" || Array.isArray(plugin.bootstrap)) {
        error("plugin.yaml: bootstrap must be an object");
      } else if (
        plugin.bootstrap.sessionStart !== undefined &&
        typeof plugin.bootstrap.sessionStart !== "boolean"
      ) {
        error("plugin.yaml: bootstrap.sessionStart must be a boolean");
      }
    }

    // MCP server metadata validation.
    if (plugin.mcp_servers !== undefined) {
      const findings = validateMcpMetadata(plugin.mcp_servers);
      for (const f of findings) {
        if (f.severity === "error") error(`plugin.yaml: ${f.message}`);
        else warn(`plugin.yaml: ${f.message}`);
      }
      if (findings.filter((f) => f.severity === "error").length === 0) {
        const servers = Object.keys(plugin.mcp_servers ?? {});
        if (servers.length > 0) ok(`plugin.yaml: ${servers.length} MCP server(s): ${servers.join(", ")}`);
      }
    }

    // Scan plugin files for secrets
    scanForSecrets(yamlPath);
  } catch (e) {
    error(`plugin.yaml: YAML parse error: ${(e as Error).message}`);
  }
}

function validateSkillOwnership(): void {
  console.log("\n── Skill Ownership ──");
  const registrations = collectSkillRegistrations(ROOT);
  const findings = findDuplicateSkillRegistrationFindings(registrations);

  for (const finding of findings) {
    if (finding.severity === "error") error(finding.message);
    else warn(finding.message);
  }

  if (findings.filter((finding) => finding.severity === "error").length === 0) {
    ok(`${registrations.length} first-party skill registration(s) checked for duplicate ownership`);
  }
}

function collectSessionStartAnchors(): SessionStartAnchor[] {
  const anchors: SessionStartAnchor[] = [];
  if (!fs.existsSync(PLUGINS_DIR)) return anchors;

  for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(PLUGINS_DIR, entry.name, "plugin.yaml");
    if (!fs.existsSync(yamlPath)) continue;

    try {
      const plugin = YAML.parse(fs.readFileSync(yamlPath, "utf-8"));
      const hasSessionStart = Array.isArray(plugin.hooks?.SessionStart) && plugin.hooks.SessionStart.length > 0;
      if (!hasSessionStart || plugin.bootstrap?.sessionStart === false) continue;

      for (const skill of plugin.skills ?? []) {
        const skillName = path.basename(skill.path ?? "");
        if (!skillName.startsWith("using-")) continue;
        const skillPath = path.join(PLUGINS_DIR, entry.name, "skills", skillName, "SKILL.md");
        if (!fs.existsSync(skillPath)) continue;
        anchors.push({
          plugin: entry.name,
          skill: skillName,
          bytes: Buffer.byteLength(fs.readFileSync(skillPath, "utf-8")),
        });
      }
    } catch {
      // YAML parse errors are reported in validatePlugin.
    }
  }

  return anchors;
}

function collectBootstrapAnchors(): BootstrapAnchor[] {
  const anchors: BootstrapAnchor[] = [];
  if (!fs.existsSync(PLUGINS_DIR)) return anchors;

  for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const yamlPath = path.join(PLUGINS_DIR, entry.name, "plugin.yaml");
    if (!fs.existsSync(yamlPath)) continue;

    try {
      const plugin = YAML.parse(fs.readFileSync(yamlPath, "utf-8"));
      for (const skill of plugin.skills ?? []) {
        const skillName = path.basename(skill.path ?? "");
        if (!skillName.startsWith("using-")) continue;
        anchors.push({
          plugin: entry.name,
          skill: skillName,
          platforms: Array.isArray(skill.platforms) ? skill.platforms : [],
        });
      }
    } catch {
      // YAML parse errors are reported in validatePlugin.
    }
  }

  return anchors;
}

function requireFile(filePath: string, label: string): string | null {
  if (!fs.existsSync(filePath)) {
    error(`${label}: missing ${path.relative(ROOT, filePath)}`);
    return null;
  }
  return fs.readFileSync(filePath, "utf-8");
}

function validateBootstrapHostOutputs(): void {
  console.log("\n── Bootstrap Host Outputs ──");
  const anchors = collectBootstrapAnchors();
  if (anchors.length === 0) return;

  const outputRoot = path.join(ROOT, "output");
  if (!fs.existsSync(outputRoot)) {
    warn("generated output/ directory not found; run bun run build before validating bootstrap host outputs");
    return;
  }

  for (const anchor of anchors) {
    const label = `${anchor.plugin}:${anchor.skill}`;
    const platforms = new Set(anchor.platforms);

    if (platforms.has("claude")) {
      const manifest = requireFile(
        path.join(PLUGINS_DIR, anchor.plugin, ".claude-plugin", "plugin.json"),
        `${label} Claude manifest`,
      );
      if (manifest) {
        const parsed = JSON.parse(manifest);
        const command = parsed.hooks?.SessionStart?.[0]?.hooks?.[0]?.command;
        if (command !== "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh") {
          error(`${label}: Claude SessionStart hook must use \${CLAUDE_PLUGIN_ROOT}`);
        }
      }
    }

    if (platforms.has("cursor")) {
      const skill = requireFile(
        path.join(outputRoot, "cursor", ".agents", "skills", anchor.skill, "SKILL.md"),
        `${label} Cursor skill`,
      );
      if (skill && !/^disable-model-invocation: true$/m.test(skill)) {
        error(`${label}: Cursor generated anchor skill must set disable-model-invocation: true`);
      }

      const rule = requireFile(
        path.join(outputRoot, "cursor", "rules", `${anchor.skill}.mdc`),
        `${label} Cursor rule`,
      );
      if (rule && !/^alwaysApply: true$/m.test(rule)) {
        error(`${label}: Cursor bootstrap rule must emit alwaysApply: true`);
      }

      const manifest = requireFile(
        path.join(PLUGINS_DIR, anchor.plugin, ".cursor-plugin", "plugin.json"),
        `${label} Cursor manifest`,
      );
      if (manifest) {
        const parsed = JSON.parse(manifest);
        const command = parsed.hooks?.SessionStart?.[0]?.hooks?.[0]?.command;
        if (command !== "${CURSOR_PLUGIN_ROOT}/hooks/session-start.sh") {
          error(`${label}: Cursor SessionStart hook must use \${CURSOR_PLUGIN_ROOT}`);
        }
      }
    }

    if (platforms.has("codex")) {
      const skill = requireFile(
        path.join(outputRoot, "codex", ".agents", "skills", anchor.skill, "SKILL.md"),
        `${label} Codex skill`,
      );
      if (skill && !new RegExp(`^name: ${anchor.skill}$`, "m").test(skill)) {
        error(`${label}: Codex generated skill must preserve the anchor name`);
      }

      const agents = requireFile(
        path.join(outputRoot, "codex", ".agents", "plugins", anchor.plugin, "AGENTS.md"),
        `${label} Codex AGENTS`,
      );
      if (agents && !agents.includes(`.agents/skills/${anchor.skill}/SKILL.md`)) {
        error(`${label}: Codex scoped AGENTS.md must point at the discipline anchor`);
      }
    }

    if (platforms.has("agents")) {
      const agents = requireFile(
        path.join(outputRoot, "agents", "plugins", anchor.plugin, "AGENTS.md"),
        `${label} generic AGENTS`,
      );
      if (agents && !agents.includes(`.agents/skills/${anchor.skill}/SKILL.md`)) {
        error(`${label}: generic scoped AGENTS.md must point at the discipline anchor`);
      }
    }

    if (platforms.has("opencode")) {
      const pluginIndex = requireFile(
        path.join(outputRoot, "opencode", "plugins", anchor.plugin, "index.ts"),
        `${label} OpenCode plugin`,
      );
      if (pluginIndex) {
        for (const expected of [`../../.agents/skills/${anchor.skill}/SKILL.md`, "systemPrompt", 'name: "use_skill"']) {
          if (!pluginIndex.includes(expected)) {
            error(`${label}: OpenCode plugin missing '${expected}'`);
          }
        }
      }
      requireFile(
        path.join(outputRoot, "opencode", ".agents", "skills", anchor.skill, "SKILL.md"),
        `${label} OpenCode skill`,
      );
    }

    if (platforms.has("gemini")) {
      const extension = requireFile(
        path.join(outputRoot, "gemini", "plugins", anchor.plugin, "gemini-extension.json"),
        `${label} Gemini extension`,
      );
      if (extension) {
        const parsed = JSON.parse(extension);
        // name, version, and description are required by the extension schema;
        // a manifest missing them declares nothing Gemini can load.
        for (const field of ["name", "version", "description"]) {
          if (typeof parsed[field] !== "string" || parsed[field].length === 0) {
            error(`${label}: Gemini extension manifest must set a non-empty '${field}'`);
          }
        }
        if (parsed.contextFileName !== "GEMINI.md") {
          error(`${label}: Gemini extension must set contextFileName to GEMINI.md`);
        }
      }

      // F4: the extension must also carry the plugin's on-demand skills, not
      // just the persistent bootstrap context.
      const bundledRoot = path.join(outputRoot, "gemini", "plugins", anchor.plugin, "skills");
      requireFile(
        path.join(bundledRoot, anchor.skill, "SKILL.md"),
        `${label} Gemini bundled skill`,
      );

      const gemini = requireFile(
        path.join(outputRoot, "gemini", "plugins", anchor.plugin, "GEMINI.md"),
        `${label} Gemini context`,
      );
      if (gemini && !new RegExp(`^# ${anchor.skill}$`, "m").test(gemini)) {
        error(`${label}: Gemini context must contain the anchor body`);
      }
    }
  }

  ok(`${anchors.length} discipline anchor host output set(s) validated`);
}

// ─── Skill template validation ──────────────────────────────

function collectKnownSkills(): Set<string> {
  const known = new Set<string>();
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "SKILL.md.tmpl") {
        // Skill name is the parent directory name.
        known.add(path.basename(path.dirname(full)));
      }
    }
  }
  walk(SKILLS_DIR);
  return known;
}

function validateSkillTemplates(): void {
  console.log("\n── Skill Templates ──");
  let count = 0;
  const knownSkills = collectKnownSkills();

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "SKILL.md.tmpl" || entry.name === "SKILL.md") {
        validateSkillFile(full, knownSkills);
        count++;
      }
    }
  }

  walk(SKILLS_DIR);

  // Cycle check across the whole `benefits-from` graph. The graph is
  // advisory so cycles are warnings, not errors — they just mean the
  // generated `benefits-of` reverse lookup will be ambiguous and the
  // routing index may double-list a skill.
  const cycles = computeBenefitsFromCycles();
  if (cycles.length > 0) {
    for (const c of cycles) {
      warn(`benefits-from cycle: ${c.join(" → ")}`);
    }
  }

  ok(`${count} skill files validated`);
}

function computeBenefitsFromCycles(): string[][] {
  const skills: Array<{ name: string; benefitsFrom: string[] }> = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "SKILL.md.tmpl") {
        const content = fs.readFileSync(full, "utf-8");
        if (!content.startsWith("---\n")) continue;
        const fmEnd = content.indexOf("\n---", 4);
        if (fmEnd === -1) continue;
        const fm = content.slice(4, fmEnd);
        let parsed: Record<string, unknown> = {};
        try {
          parsed = (YAML.parse(fm) as Record<string, unknown>) ?? {};
        } catch {
          parsed = {};
        }
        const benefitsFrom = Array.isArray(parsed["benefits-from"])
          ? (parsed["benefits-from"] as unknown[]).filter((v): v is string => typeof v === "string")
          : [];
        skills.push({ name: path.basename(path.dirname(full)), benefitsFrom });
      }
    }
  }

  walk(SKILLS_DIR);
  return detectCycles(buildForwardGraph(skills));
}

function validateSkillFile(filePath: string, knownSkills: Set<string> = new Set()): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const relPath = path.relative(ROOT, filePath);

  // Must have frontmatter
  if (!content.startsWith("---\n")) {
    error(`${relPath}: missing frontmatter (must start with ---)`);
    return;
  }

  const fmEnd = content.indexOf("\n---", 4);
  if (fmEnd === -1) {
    error(`${relPath}: unclosed frontmatter`);
    return;
  }

  const frontmatter = content.slice(4, fmEnd);

  let parsed: Record<string, unknown> = {};
  try {
    parsed = (YAML.parse(frontmatter) as Record<string, unknown>) ?? {};
  } catch (e) {
    error(`${relPath}: frontmatter is not valid YAML: ${(e as Error).message}`);
    return;
  }

  // V2 frontmatter schema validation. Runs only on .tmpl files so authors
  // get feedback at the source — generated SKILL.md inherits whatever the
  // template emits.
  if (filePath.endsWith(".tmpl")) {
    const report = validateV2Frontmatter(parsed, knownSkills);
    for (const f of report.errors) error(`${relPath}: ${f.message}`);
    for (const f of report.warnings) warn(`${relPath}: ${f.message}`);
  }

  // Must have name
  if (!frontmatter.match(/^name:\s*.+$/m)) {
    error(`${relPath}: missing 'name' in frontmatter`);
  }

  // Must have description
  if (!frontmatter.match(/^description:/m)) {
    error(`${relPath}: missing 'description' in frontmatter`);
  }

  // Skill name: no colons, kebab-case
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    if (name.includes(":")) {
      error(`${relPath}: skill name '${name}' must not contain ':'`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      error(`${relPath}: skill name '${name}' must be lowercase kebab-case`);
    }
    if (name.length > 64) {
      warn(`${relPath}: skill name '${name}' exceeds 64 chars`);
    }
  }

  const body = content.slice(fmEnd + 4);
  // Measure what Claude actually receives, not what was authored: `triggers`
  // is projected into `when_to_use`, and both count toward Claude's combined
  // description cap.
  const claudeFm = projectFrontmatter(
    toAuthoringSkill(parsed, path.basename(path.dirname(filePath))),
    { profile: "claude", hostName: "claude", supportsToolAllowlist: true },
  );
  for (const finding of validateSkillBudget({
    description: flattenSkillText(claudeFm.description),
    whenToUse: flattenSkillText(claudeFm.when_to_use),
    body,
  })) {
    error(`${relPath}: ${finding.message}`);
  }

  // Check for unresolved placeholders (in .md files, not .tmpl)
  if (filePath.endsWith(".md") && !filePath.endsWith(".tmpl")) {
    const unresolved = content.match(/\{\{(\w+)\}\}/g);
    if (unresolved) {
      error(`${relPath}: unresolved placeholders: ${unresolved.join(", ")}`);
    }
  }

  // Decision-gate format lint. We only validate templates so authors get
  // feedback at the source, not after projection.
  if (filePath.endsWith(".tmpl")) {
    for (const finding of lintDecisionGates(body)) {
      const where = `${relPath}: Decision Gate '${finding.topic}': ${finding.message}`;
      if (finding.severity === "error") error(where);
      else warn(where);
    }
  }

  // Secret scan
  scanForSecrets(filePath);
}

function validateUpstreamLocks(): void {
  console.log("\n── Upstream provenance ──");
  try {
    const manifest = loadUpstreamManifest(ROOT);
    validateManifestInventory(manifest, ROOT);
    const report = checkOffline(ROOT, manifest);
    const failed = report.artifacts.filter((artifact) => artifact.conclusion === "validation-failed");
    if (failed.length > 0) {
      for (const artifact of failed) error(`upstream artifact '${artifact.artifact}' is not active: ${artifact.verification.join(", ")}`);
      return;
    }
    ok(`${manifest.skills.length} skill origins and ${report.artifacts.length} upstream lock(s) validated`);
  } catch (cause) {
    error(`upstream manifest: ${(cause as Error).message}`);
  }
}

// ─── Strict Agent Skills conformance ────────────────────────

/**
 * Blocking conformance gate for every artifact that claims to be a plain
 * Agent Skill: Codex, OpenCode, Gemini, and anything uploaded to a strict
 * consumer. The rules live in scripts/lib/agent-skills-spec.ts, written from
 * the published specification rather than delegated to `skills-ref` — see
 * dev-doc/2026-08-modernization-plan.md, F14 and Checkpoint 3.
 */
function validateStrictAgentSkills(): void {
  console.log("\n── Agent Skills Spec Conformance ──");
  console.log(`  spec revision ${SPEC_REVISION} — ${SPEC_URL}`);

  const hosts = ALL_HOSTS.filter(
    (h) => h.skillProjection === "strict" && h.projections.includes("skill"),
  );
  if (hosts.length === 0) {
    warn("no host emits a strict Agent Skills artifact — the spec gate checked nothing");
    return;
  }

  let checked = 0;
  for (const host of hosts) {
    const root = path.join(ROOT, "output", host.name, host.skillOutputDir ?? "");
    if (!fs.existsSync(root)) {
      error(`${host.displayName}: expected strict skill output at ${path.relative(ROOT, root)}`);
      continue;
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(root, entry.name, "SKILL.md");
      if (!fs.existsSync(skillPath)) {
        error(`${path.relative(ROOT, path.join(root, entry.name))}: missing SKILL.md`);
        continue;
      }

      const rel = path.relative(ROOT, skillPath);
      const content = fs.readFileSync(skillPath, "utf-8");
      if (!content.startsWith("---\n")) {
        error(`${rel}: missing frontmatter`);
        continue;
      }
      const fmEnd = content.indexOf("\n---", 4);
      if (fmEnd === -1) {
        error(`${rel}: unclosed frontmatter`);
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = (YAML.parse(content.slice(4, fmEnd)) as Record<string, unknown>) ?? {};
      } catch (e) {
        error(`${rel}: frontmatter is not valid YAML: ${(e as Error).message}`);
        continue;
      }

      const report = validateAgentSkillFrontmatter(parsed, entry.name);
      for (const issue of report.errors) error(`${rel}: ${issue.field}: ${issue.message}`);
      for (const issue of report.warnings) warn(`${rel}: ${issue.field}: ${issue.message}`);
      checked++;
    }
  }

  ok(`${checked} strict Agent Skills artifact(s) checked across ${hosts.length} host(s)`);
}

// ─── Main ───────────────────────────────────────────────────

console.log("Trove — Validation");
console.log("═".repeat(45));

if (validateAll || marketplaceOnly) {
  validateMarketplace();
}

if (validateAll || pluginsOnly) {
  // Find and validate each plugin
  if (fs.existsSync(PLUGINS_DIR)) {
    const plugins = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const plugin of plugins) {
      validatePlugin(plugin);
    }

    validateSkillOwnership();
  }
}

if (validateAll) {
  validateUpstreamLocks();
  validateSkillTemplates();
  validateStrictAgentSkills();
  validateBootstrapHostOutputs();

  const anchors = collectSessionStartAnchors();
  const total = anchors.reduce((sum, anchor) => sum + anchor.bytes, 0);
  if (anchors.length > 1 && total > 8000) {
    warn(
      `SessionStart using-* anchors total ${total} bytes across ${anchors.length} plugins: ` +
        anchors.map((a) => `${a.plugin}:${a.skill}`).join(", "),
    );
  } else if (anchors.length > 0) {
    ok(`SessionStart using-* anchor budget: ${total} bytes across ${anchors.length} plugin(s)`);
  }
}

// Summary
console.log("\n" + "═".repeat(45));
if (errors > 0) {
  console.error(`✗ ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`✓ Passed with ${warnings} warning(s)`);
} else {
  console.log("✓ All validations passed");
}
