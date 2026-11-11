/**
 * Discovery taxonomy.
 *
 * Categories are authored once: the vocabulary in `categories.yaml`, the
 * plugin's category in `plugin.yaml`, and each skill's category on its
 * registration. This module only reads those inputs, so skill generation can
 * resolve a category without a built catalog.
 *
 * The ids are Trove's. A label is what a host receives, and only a host whose
 * contract accepts a free-form category string receives one.
 */
import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import { ROOT, loadPlugins } from "./skill-parser";

export interface DiscoveryCategory {
  id: string;
  label: string;
}

export interface CategoryTaxonomy {
  schemaVersion: number;
  source: string;
  observedAt: string;
  categories: DiscoveryCategory[];
}

/** A plugin or skill that names a category the taxonomy does not define. */
export interface CategoryAssignmentError {
  where: string;
  message: string;
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The category string each plugin had before canonical ids. The catalog keeps
 * it so `trove list --category=workflow` still returns only the workflow
 * plugin, even though workflow and dev now share the Engineering label.
 * These are selectors, not synonyms: nothing maps them onto the canonical id.
 */
const LEGACY_SELECTOR: Record<string, string> = {
  "trove-workflow": "workflow",
  "trove-dev": "development",
  "trove-design": "design",
  "trove-product": "product",
  "trove-security": "security",
  "trove-infra": "infrastructure",
  "trove-research": "research",
  "trove-doc": "documentation",
  "trove-media": "media",
};

/** The pre-taxonomy category string for a plugin, if it has one. */
export function legacyCategorySelector(pluginName: string): string | undefined {
  return LEGACY_SELECTOR[pluginName];
}

export function loadTaxonomy(root: string = ROOT): CategoryTaxonomy {
  const file = path.join(root, "categories.yaml");
  const raw = YAML.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  const list = Array.isArray(raw.categories) ? raw.categories : [];
  const categories = list
    .filter((entry): entry is { id: string; label: string } =>
      !!entry && typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string" &&
      typeof (entry as { label?: unknown }).label === "string")
    .map((entry) => ({ id: entry.id, label: entry.label }));
  return {
    schemaVersion: typeof raw.schema_version === "number" ? raw.schema_version : 0,
    source: typeof raw.source === "string" ? raw.source : "",
    observedAt: typeof raw.observed_at === "string" ? raw.observed_at : "",
    categories,
  };
}

/** Structural problems in the vocabulary itself, before any assignment. */
export function taxonomyProblems(taxonomy: CategoryTaxonomy): string[] {
  const problems: string[] = [];
  if (taxonomy.schemaVersion !== 1) problems.push(`schema_version must be 1 (got ${taxonomy.schemaVersion})`);
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  for (const category of taxonomy.categories) {
    if (!ID_PATTERN.test(category.id)) problems.push(`category id '${category.id}' is not kebab-case`);
    if (category.label.trim().length === 0) problems.push(`category '${category.id}' has an empty label`);
    if (seenIds.has(category.id)) problems.push(`duplicate category id '${category.id}'`);
    const labelKey = category.label.toLowerCase();
    if (seenLabels.has(labelKey)) problems.push(`duplicate category label '${category.label}'`);
    seenIds.add(category.id);
    seenLabels.add(labelKey);
  }
  return problems;
}

function index(taxonomy: CategoryTaxonomy): Map<string, DiscoveryCategory> {
  return new Map(taxonomy.categories.map((category) => [category.id, category]));
}

/**
 * Every registered skill must name exactly one known category, and a plugin's
 * category must be known too. Commands and agents are not categorized.
 */
export function assignmentErrors(root: string = ROOT): CategoryAssignmentError[] {
  if (!fs.existsSync(path.join(root, "categories.yaml"))) {
    return [{ where: "categories.yaml", message: "missing; every plugin and skill needs a category" }];
  }
  const taxonomy = loadTaxonomy(root);
  const known = index(taxonomy);
  const errors: CategoryAssignmentError[] = [];
  for (const problem of taxonomyProblems(taxonomy)) {
    errors.push({ where: "categories.yaml", message: problem });
  }

  for (const plugin of loadPlugins(path.join(root, "plugins"))) {
    const category = plugin.yaml.category;
    if (!category || !known.has(category)) {
      errors.push({
        where: `plugins/${plugin.name}/plugin.yaml`,
        message: `category '${category ?? ""}' is not in the taxonomy`,
      });
    }
    for (const skill of plugin.yaml.skills ?? []) {
      const skillName = path.basename(skill.path);
      if (!skill.category) {
        errors.push({
          where: `plugins/${plugin.name}/plugin.yaml`,
          message: `skill '${skillName}' has no category`,
        });
      } else if (!known.has(skill.category)) {
        errors.push({
          where: `plugins/${plugin.name}/plugin.yaml`,
          message: `skill '${skillName}' category '${skill.category}' is not in the taxonomy`,
        });
      }
    }
  }

  // A local plugin's category is authored in plugin.yaml. A category on its
  // marketplace entry would be a second source that can only drift.
  const marketplacePath = path.join(root, "marketplace.yaml");
  if (fs.existsSync(marketplacePath)) {
    const marketplace = YAML.parse(fs.readFileSync(marketplacePath, "utf-8")) as {
      plugins?: Array<{ name?: string; source?: unknown; category?: string }>;
    };
    for (const entry of marketplace.plugins ?? []) {
      if (typeof entry.source === "string" && entry.category) {
        errors.push({
          where: "marketplace.yaml",
          message: `'${entry.name}' sets category '${entry.category}', which belongs in its plugin.yaml`,
        });
      }
    }
  }

  return errors;
}

export interface ResolvedSkillCategory {
  skill: string;
  plugin: string;
  category: DiscoveryCategory;
}

/**
 * The category a skill ships with. Reads authoring inputs only, so it is safe
 * to call from skill generation before any marketplace artifact exists.
 * Returns undefined when the skill is unregistered or its category is unknown;
 * `assignmentErrors` is what turns that into a validation failure.
 */
export function resolveSkillCategory(
  skillName: string,
  root: string = ROOT,
): ResolvedSkillCategory | undefined {
  const known = index(loadTaxonomy(root));
  for (const plugin of loadPlugins(path.join(root, "plugins"))) {
    for (const skill of plugin.yaml.skills ?? []) {
      if (path.basename(skill.path) !== skillName || !skill.category) continue;
      const category = known.get(skill.category);
      if (!category) return undefined;
      return { skill: skillName, plugin: plugin.name, category };
    }
  }
  return undefined;
}

/** The display label for a plugin's category, or undefined when it is unset. */
export function pluginCategoryLabel(categoryId: string | undefined, root: string = ROOT): string | undefined {
  if (!categoryId) return undefined;
  return index(loadTaxonomy(root)).get(categoryId)?.label;
}
