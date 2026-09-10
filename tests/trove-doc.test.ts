import { beforeAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";
import { loadAndParseTemplate } from "../scripts/lib/skill-parser";
import { loadUpstreamManifest } from "../scripts/lib/upstream-manifest";
import { buildOnceForTests } from "./helpers/build";

const ROOT = path.resolve(import.meta.dir, "..");
const SKILLS = [
  "trove-obsidian-markdown",
  "trove-obsidian-bases",
  "trove-json-canvas",
  "trove-obsidian-cli",
  "trove-web-clip",
];
const SOURCE = path.join(ROOT, "skills/documentation");

beforeAll(buildOnceForTests, 120_000);

test("doc skills retain their full MIT notice and references in installable bundles", () => {
  const destinations = [
    "plugins/trove-doc/skills",
    "plugins/trove-doc/.agents/skills",
    "plugins/trove-doc/.copilot/skills",
    "output/cursor/.agents/skills",
    "output/codex/.agents/skills",
    "output/opencode/.agents/skills",
    "output/gemini/.agents/skills",
    "output/gemini/plugins/trove-doc/skills",
  ];
  for (const skill of SKILLS) {
    const references = path.join(SOURCE, skill, "references");
    const license = fs.readFileSync(path.join(references, "LICENSE.md"), "utf8");
    expect(license).toContain("Copyright (c) 2026 Steph Ango (@kepano)");
    expect(license).toContain("THE SOFTWARE IS PROVIDED");
    for (const destination of destinations) {
      const bundled = path.join(ROOT, destination, skill);
      expect(fs.existsSync(path.join(bundled, "SKILL.md"))).toBe(true);
      for (const reference of fs.readdirSync(references)) {
        expect(fs.readFileSync(path.join(bundled, "references", reference), "utf8"))
          .toBe(fs.readFileSync(path.join(references, reference), "utf8"));
      }
    }
  }
});

test("scoped AGENTS document links resolve to bundled per-skill references", () => {
  for (const destination of ["output/agents/plugins/trove-doc", "output/codex/.agents/plugins/trove-doc"]) {
    const directory = path.join(ROOT, destination);
    const body = fs.readFileSync(path.join(directory, "AGENTS.md"), "utf8");
    for (const skill of SKILLS) {
      for (const reference of fs.readdirSync(path.join(SOURCE, skill, "references"))) {
        const relative = `./skills/${skill}/references/${reference}`;
        expect(body).toContain(`](${relative})`);
        expect(fs.readFileSync(path.join(directory, relative), "utf8"))
          .toBe(fs.readFileSync(path.join(SOURCE, skill, "references", reference), "utf8"));
      }
    }
    expect(body).not.toContain("](references/");
  }
});

test("Obsidian behavior does not auto-attach to ordinary Markdown or invoke tools from globs", () => {
  for (const skill of ["trove-obsidian-markdown", "trove-obsidian-cli", "trove-web-clip"]) {
    const parsed = loadAndParseTemplate({ path: path.join(SOURCE, skill, "SKILL.md.tmpl"), skillName: skill });
    expect(parsed.v2.activation?.globs ?? []).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, "plugins/trove-doc/rules", `${skill}.mdc`))).toBe(false);
  }
  for (const [skill, extension] of [["trove-obsidian-bases", "base"], ["trove-json-canvas", "canvas"]]) {
    const rule = fs.readFileSync(path.join(ROOT, "plugins/trove-doc/rules", `${skill}.mdc`), "utf8");
    expect(rule).toContain(`globs: **/*.${extension}`);
    expect(rule).toContain("alwaysApply: false");
  }
});

test("doc provenance agrees with skill metadata without depending on the sample checkout", () => {
  const manifest = loadUpstreamManifest(ROOT);
  const source = manifest.sources.find((entry) => entry.id === "obsidian-skills");
  expect(source?.repository).toBe("https://github.com/kepano/obsidian-skills.git");
  expect(source?.artifacts).toEqual([]);
  for (const skill of SKILLS) {
    const origin = manifest.skills.find((entry) => entry.localPath === `skills/documentation/${skill}`);
    if (!origin || origin.origin !== "adapted") throw new Error(`Missing adapted provenance for ${skill}`);
    const parsed = loadAndParseTemplate({ path: path.join(SOURCE, skill, "SKILL.md.tmpl"), skillName: skill });
    expect(origin.sourceId).toBe("obsidian-skills");
    expect(parsed.frontmatter.metadata).toMatchObject({
      source: "kepano/obsidian-skills",
      "upstream-skill": path.basename(origin.upstreamPath),
      "upstream-revision": origin.evidenceSha,
    });
  }
});

test("document skill JSON and YAML examples parse", () => {
  let jsonExamples = 0;
  let yamlExamples = 0;
  for (const skill of SKILLS) {
    const directory = path.join(SOURCE, skill);
    const files = ["SKILL.md.tmpl", ...fs.readdirSync(path.join(directory, "references"))
      .filter((name) => name !== "LICENSE.md").map((name) => `references/${name}`)];
    for (const file of files) {
      const body = fs.readFileSync(path.join(directory, file), "utf8");
      for (const block of body.matchAll(/^```(json|yaml)\n([\s\S]*?)^```/gm)) {
        if (block[1] === "json") {
          expect(() => JSON.parse(block[2])).not.toThrow();
          jsonExamples++;
        } else {
          const yaml = block[2].replace(/^---\n/, "").replace(/\n---\n?$/, "");
          expect(YAML.parseDocument(yaml).errors).toEqual([]);
          yamlExamples++;
        }
      }
    }
  }
  expect(jsonExamples).toBeGreaterThan(0);
  expect(yamlExamples).toBeGreaterThan(0);
});
