#!/usr/bin/env bun
/**
 * Scaffold a new skill template and register it in the parent plugin.
 *
 * Usage:
 *   bun run scaffold:skill -- --plugin trove-dev --name trove-debug --discovery-category engineering
 *   bun run scaffold:skill -- --plugin trove-dev --name trove-test --discovery-category code --auto-attach "**\/*.test.ts"
 *
 * `--category` is the source directory under skills/. `--discovery-category`
 * is the browsing category id from categories.yaml; every registered skill
 * needs one, so the scaffold asks for it instead of guessing.
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import { loadTaxonomy } from "./lib/categories";

const ROOT = path.resolve(import.meta.dir, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const PLUGINS_DIR = path.join(ROOT, "plugins");

// ─── Arg parsing ────────────────────────────────────────────

interface SkillArgs {
  plugin: string;
  name: string;
  category: string;
  discoveryCategory: string;
  autoAttach?: string;
}

function parseArgs(): SkillArgs {
  const args = process.argv.slice(2);
  let plugin = "";
  let name = "";
  let category = "shared";
  let discoveryCategory = "";
  let autoAttach: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--plugin" && args[i + 1]) plugin = args[++i];
    if (args[i] === "--name" && args[i + 1]) name = args[++i];
    if (args[i] === "--category" && args[i + 1]) category = args[++i];
    if (args[i] === "--discovery-category" && args[i + 1]) discoveryCategory = args[++i];
    if (args[i] === "--auto-attach" && args[i + 1]) autoAttach = args[++i];
  }

  if (!plugin || !name || !discoveryCategory) {
    console.error(
      "Usage: bun run scaffold:skill -- --plugin <plugin-name> --name <skill-name> " +
        "--discovery-category <id> [--category shared] [--auto-attach '**/*.py']",
    );
    process.exit(1);
  }

  if (!name.startsWith("trove-")) {
    console.error(`Skill name must start with 'trove-'. Got: ${name}`);
    process.exit(1);
  }

  const known = loadTaxonomy(ROOT).categories.map((entry) => entry.id);
  if (!known.includes(discoveryCategory)) {
    console.error(`Unknown --discovery-category '${discoveryCategory}'. Choose an id from categories.yaml.`);
    process.exit(1);
  }

  return { plugin, name, category, discoveryCategory, autoAttach };
}

// ─── Main ───────────────────────────────────────────────────

const { plugin, name, category, discoveryCategory, autoAttach } = parseArgs();

// Validate plugin exists
const pluginDir = path.join(PLUGINS_DIR, plugin);
const pluginYamlPath = path.join(pluginDir, "plugin.yaml");
if (!fs.existsSync(pluginYamlPath)) {
  console.error(`Plugin not found: ${plugin}. Run scaffold:plugin first.`);
  process.exit(1);
}

// Create skill template directory
const skillDir = path.join(SKILLS_DIR, category, name);
if (fs.existsSync(skillDir)) {
  console.error(`Skill directory already exists: ${path.relative(ROOT, skillDir)}`);
  process.exit(1);
}

fs.mkdirSync(skillDir, { recursive: true });
fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });

// Create SKILL.md.tmpl with v2 frontmatter (version + preamble-tier +
// activation.globs). v2 fields are additive over v1; legacy `paths:` is
// no longer emitted for new skills — `activation.globs` is canonical.
const frontmatter = [
  "---",
  `name: ${name}`,
  `description: |`,
  `  TODO: Add description for ${name}.`,
  `version: 1.0.0`,
  `preamble-tier: 2`,
];

if (autoAttach) {
  frontmatter.push(`user-invocable: false`);
  // Mirror the comma-separated `--auto-attach` value into a globs array.
  const globs = autoAttach.split(",").map((g) => g.trim()).filter(Boolean);
  frontmatter.push(`activation:`);
  frontmatter.push(`  globs:`);
  for (const g of globs) frontmatter.push(`    - "${g}"`);
}

// Triggers placeholder — authors should fill in 2-4 natural-phrasing
// prompts before shipping. Keeping the section visible (vs omitting it)
// nudges authors to add them.
frontmatter.push(`triggers:`);
frontmatter.push(`  - TODO: trigger 1`);
frontmatter.push(`  - TODO: trigger 2`);

frontmatter.push("---");

const skillContent = `${frontmatter.join("\n")}

{{PREAMBLE}}

# ${name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}

## Overview

TODO: Describe what this skill does.

## Conventions

TODO: Add conventions and patterns.

## AI Gotchas

TODO: Common mistakes AI makes with this technology.
`;

fs.writeFileSync(path.join(skillDir, "SKILL.md.tmpl"), skillContent);

// Register skill in plugin.yaml
const pluginYaml = YAML.parse(fs.readFileSync(pluginYamlPath, "utf-8"));
if (!pluginYaml.skills) pluginYaml.skills = [];

const skillEntry: Record<string, unknown> = {
  path: `./skills/${name}`,
  platforms: ["claude", "cursor", "codex", "agents", "copilot"],
  category: discoveryCategory,
};

if (autoAttach) {
  skillEntry.auto_attach = { globs: [autoAttach] };
}

pluginYaml.skills.push(skillEntry);

fs.writeFileSync(pluginYamlPath, YAML.stringify(pluginYaml, { lineWidth: 100 }));

console.log(`\n✓ Skill scaffolded: ${path.relative(ROOT, skillDir)}/`);
console.log(`  ├── SKILL.md.tmpl`);
console.log(`  └── references/`);
console.log(`\n✓ Registered in ${plugin}/plugin.yaml`);
console.log(`\nNext steps:`);
console.log(`  1. Edit ${path.relative(ROOT, path.join(skillDir, "SKILL.md.tmpl"))}`);
console.log(`  2. Add supporting docs to references/`);
console.log(`  3. Run: bun run build`);
console.log(`  4. Run: bun run validate`);
