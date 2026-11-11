import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";
import { loadTaxonomy } from "../scripts/lib/categories";

const ROOT = path.resolve(import.meta.dir, "..");

function readJson(relative: string): any {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf-8"));
}

function trove(...args: string[]): { status: number | null; out: string; err: string } {
  const result = spawnSync("./bin/trove", args, { cwd: ROOT, stdio: "pipe" });
  return { status: result.status, out: result.stdout?.toString() ?? "", err: result.stderr?.toString() ?? "" };
}

const labels = new Map(loadTaxonomy(ROOT).categories.map((entry) => [entry.id, entry.label]));
const catalog = readJson("catalog.json");

// ─── Host projections ──────────────────────────────────────────────

test("marketplace entries and both Codex category fields carry the same display label", () => {
  const claude = readJson(".claude-plugin/marketplace.json").plugins;
  const codex = readJson(".agents/plugins/marketplace.json").plugins;
  for (const plugin of catalog.plugins) {
    const expected = labels.get(plugin.categoryId);
    expect(expected).toBeDefined();
    expect(claude.find((entry: any) => entry.name === plugin.name).category).toBe(expected);
    expect(codex.find((entry: any) => entry.name === plugin.name).category).toBe(expected);
    const manifest = readJson(`plugins/${plugin.name}/.codex-plugin/plugin.json`);
    // Codex lets the marketplace category win; the two must not disagree.
    expect(manifest.interface.category).toBe(expected);
    expect(readJson(`plugins/${plugin.name}/.plugin/plugin.json`).category).toBe(expected);
  }
});

test("Codex manifests keep curated keywords and invent no taxonomy fields", () => {
  const manifest = readJson("plugins/trove-dev/.codex-plugin/plugin.json");
  const authored = YAML.parse(fs.readFileSync(path.join(ROOT, "plugins/trove-dev/plugin.yaml"), "utf-8"));
  expect(manifest.keywords).toEqual(authored.keywords);
  expect(manifest.interface.tags).toBeUndefined();
  expect(manifest.tags).toBeUndefined();
});

test("skill metadata carries the category where the host keeps metadata, and Copilot drops it", () => {
  const claude = fs.readFileSync(path.join(ROOT, "skills/coding/trove-python/SKILL.md"), "utf-8");
  expect(claude).toContain("trove-category: code");
  expect(claude).toContain("trove-category-label: Code");
  const copilot = fs.readFileSync(path.join(ROOT, "plugins/trove-dev/.copilot/skills/trove-python/SKILL.md"), "utf-8");
  expect(copilot).not.toContain("trove-category");
  // No top-level `category:` key is invented in skill frontmatter.
  const frontmatter = claude.slice(4, claude.indexOf("\n---", 4));
  expect(frontmatter).not.toMatch(/^category:/m);
});

// ─── Catalog ──────────────────────────────────────────────────────────────

test("catalog indexes every registered skill exactly once and keeps legacy fields", () => {
  const registered = catalog.plugins.flatMap((plugin: any) => plugin.skills);
  const indexed = catalog.skills.map((skill: any) => skill.name);
  expect(indexed.sort()).toEqual([...registered].sort());
  expect(new Set(indexed).size).toBe(indexed.length);
  for (const plugin of catalog.plugins) {
    // Existing consumers still get a string[] of skill names and a category.
    expect(Array.isArray(plugin.skills)).toBe(true);
    expect(typeof plugin.category).toBe("string");
  }
  expect(catalog.categories.every((category: any) => category.plugins.length + category.skills.length > 0)).toBe(true);
});

test("the skill index reports each skill's own platforms, not its plugin's", () => {
  const principle = catalog.skills.find((skill: any) => skill.name === "trove-principle-laziness");
  const python = catalog.skills.find((skill: any) => skill.name === "trove-python");
  expect(principle.platforms).toContain("opencode");
  expect(python.platforms).not.toContain("opencode");
});

// ─── CLI ───────────────────────────────────────────────────────────────────

test("cli: legacy selectors keep their old membership; the canonical id spans both", () => {
  const workflow = trove("list", "--category=workflow");
  expect(workflow.out).toContain("1 plugin(s)");
  expect(workflow.out).toContain("trove-workflow");
  expect(workflow.out).not.toContain("trove-dev v");

  const development = trove("list", "--category=development");
  expect(development.out).toContain("1 plugin(s)");
  expect(development.out).toContain("trove-dev");

  const engineering = trove("list", "--category=engineering");
  expect(engineering.out).toContain("2 plugin(s)");
});

test("cli: labels with spaces and ampersands match case-insensitively", () => {
  for (const query of ["IT & security", "it & SECURITY", "it-security", "security"]) {
    const result = trove("list", `--category=${query}`);
    expect(result.status).toBe(0);
    expect(result.out).toContain("trove-security");
  }
});

test("cli: skill mode filters by the skill's own category and platform", () => {
  const code = trove("list", "--skills", "--category=code");
  expect(code.out).toContain("18 skill(s)");
  expect(code.out).toContain("trove-dev:trove-python");
  // A code skill that lives in the workflow plugin is still a code skill.
  expect(code.out).toContain("trove-workflow:trove-principle-laziness");
  expect(code.out).not.toContain("trove-workflow:trove-plan");

  const opencode = trove("list", "--skills", "--category=code", "--platform=opencode");
  expect(opencode.out).not.toContain("trove-python");
});

test("cli: skill search does not return every skill of a matching plugin", () => {
  const result = trove("search", "--skills", "obsidian");
  expect(result.out).toContain("trove-doc:trove-obsidian-cli");
  expect(result.out).not.toContain("trove-web-clip");
});

test("cli: an unknown category fails instead of printing an empty list", () => {
  const result = trove("list", "--category=not-a-category");
  expect(result.status).toBe(1);
  expect(result.err).toContain("Unknown category 'not-a-category'");
});

test("cli: categories lists only populated ones; --all adds the rest of the vocabulary", () => {
  const populated = trove("categories");
  expect(populated.out).toContain(`${catalog.categories.length} categories with content`);
  expect(populated.out).not.toContain("Nonprofit");

  const all = trove("categories", "--all");
  expect(all.out).toContain("Nonprofit (nonprofit)");
  expect(all.out).toContain(`${57 - catalog.categories.length} more in the reference vocabulary`);
});

test("cli: info shows the category for plugins and skills", () => {
  expect(trove("info", "trove-security").out).toContain("Category:    IT & security (it-security)");
  expect(trove("info", "trove-dev:trove-python").out).toContain("Category:    Code (code)");
});

// ─── Generated reference ─────────────────────────────────────────────────────

test("docs/categories.md lists every skill under its category", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs/categories.md"), "utf-8");
  for (const skill of catalog.skills) {
    expect(doc).toContain(`| ${skill.name} | ${skill.plugin} |`);
  }
  expect(doc).toContain("| trove-dev | Engineering | `engineering` | `development` |");
});
