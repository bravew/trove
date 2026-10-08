import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";
import { loadUpstreamManifest, repositoryPathAt } from "../scripts/lib/upstream-manifest";
import { checkOffline } from "../scripts/lib/upstream-sync";
import { buildOnceForTests } from "./helpers/build";

const ROOT = path.resolve(import.meta.dir, "..");
const SOURCE = path.join(ROOT, "skills/media/trove-ffmpeg");
const FRONT = path.join(SOURCE, "SKILL.md.tmpl");

/** Every bundle that carries `scripts/` must also carry the relocated templates and the notice. */
const BUNDLES = [
  "plugins/trove-media/skills/trove-ffmpeg",
  "plugins/trove-media/.agents/skills/trove-ffmpeg",
  "plugins/trove-media/.copilot/skills/trove-ffmpeg",
  "output/cursor/.agents/skills/trove-ffmpeg",
  "output/codex/.agents/skills/trove-ffmpeg",
  "output/opencode/.agents/skills/trove-ffmpeg",
  "output/gemini/.agents/skills/trove-ffmpeg",
  "output/gemini/plugins/trove-media/skills/trove-ffmpeg",
  "output/copilot/.agents/skills/trove-ffmpeg",
];

beforeAll(buildOnceForTests, 120_000);

const SHOTCRAFT_SKILLS = [
  "trove-shot-recipes",
  "trove-beat-sync",
  "trove-video-review",
  "trove-product-video",
];
const SHOTCRAFT_BUNDLES = [
  "plugins/trove-media/skills",
  "plugins/trove-media/.agents/skills",
  "plugins/trove-media/.copilot/skills",
  "output/cursor/.agents/skills",
  "output/codex/.agents/skills",
  "output/opencode/.agents/skills",
  "output/gemini/.agents/skills",
  "output/gemini/plugins/trove-media/skills",
  "output/copilot/.agents/skills",
  "output/agents/plugins/trove-media/skills",
];

function markdownFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return /\.md(?:\.tmpl)?$/.test(entry.name) ? [absolute] : [];
  });
}

function frontmatter(file: string): Record<string, unknown> {
  const match = fs.readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`missing frontmatter in ${file}`);
  return YAML.parse(match[1]) as Record<string, unknown>;
}

describe("shotcraft adaptations", () => {
  test("all four skills are registered on all seven platforms", () => {
    const plugin = YAML.parse(fs.readFileSync(path.join(ROOT, "plugins/trove-media/plugin.yaml"), "utf8"));
    for (const skill of SHOTCRAFT_SKILLS) {
      const entry = plugin.skills.find((item: { path: string }) => item.path === `./skills/${skill}`);
      expect(entry, `${skill} is not registered`).toBeDefined();
      expect([...entry.platforms].sort()).toEqual(["agents", "claude", "codex", "copilot", "cursor", "gemini", "opencode"]);
      const metadata = frontmatter(path.join(ROOT, "skills/media", skill, "SKILL.md.tmpl"));
      expect(metadata.activation).toBeUndefined();
      expect(metadata.auto_attach).toBeUndefined();
      expect(metadata.paths).toBeUndefined();
    }
    expect(plugin.auto_attach).toBeUndefined();
  });

  test("every bundled destination retains the Apache notice and changes statement", () => {
    for (const skill of SHOTCRAFT_SKILLS) {
      const notice = fs.readFileSync(path.join(ROOT, "skills/media", skill, "references/LICENSE.md"), "utf8");
      expect(notice).toContain("Apache License");
      expect(notice).toContain("Version 2.0, January 2004");
      expect(notice).toMatch(/end of terms and conditions/i);
      expect(notice).toContain("Wei Yihao");
      expect(notice).toMatch(/changes made/i);
      for (const bundle of SHOTCRAFT_BUNDLES) {
        expect(fs.readFileSync(path.join(ROOT, bundle, skill, "references/LICENSE.md"), "utf8")).toBe(notice);
      }
    }
  });

  test("generated reference links resolve within the skill's own bundle", () => {
    for (const skill of SHOTCRAFT_SKILLS) {
      for (const bundle of SHOTCRAFT_BUNDLES) {
        const directory = path.join(ROOT, bundle, skill);
        for (const file of markdownFiles(directory).filter((file) => !file.endsWith("LICENSE.md"))) {
          const body = fs.readFileSync(file, "utf8");
          for (const match of body.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
            const target = match[1].replace(/^<|>$/g, "").split("#")[0];
            if (!target || /^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
            const absolute = path.resolve(path.dirname(file), target);
            const relative = path.relative(directory, absolute);
            expect(relative.startsWith(".."), `${file} links outside its skill: ${target}`).toBe(false);
            expect(fs.existsSync(absolute), `${file} has broken link ${target}`).toBe(true);
          }
        }
      }
    }
  });

  test("provenance names the pinned source and narrowly selected paths", () => {
    const manifest = loadUpstreamManifest(ROOT);
    const source = manifest.sources.find((item) => item.id === "video-shotcraft");
    expect(source?.ref).toBe("main");
    expect(source?.license.expression).toBe("Apache-2.0");
    expect(source?.artifacts).toEqual([]);
    for (const skill of SHOTCRAFT_SKILLS) {
      const row = manifest.skills.find((item) => item.localPath === `skills/media/${skill}`);
      expect(row?.origin).toBe("adapted");
      if (row?.origin !== "adapted") throw new Error(`${skill} lacks adapted provenance`);
      expect(row.sourceId).toBe(source?.id);
      expect(row.evidenceSha).toBe("5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab");
      expect(row.upstreamPaths.length).toBeGreaterThan(0);
      expect(row.upstreamPaths).not.toContain(".");
      expect(row.upstreamPaths.some((item) => item.startsWith("workbench/"))).toBe(false);
    }
  });

  test("generated bodies are English with no unresolved template tokens", () => {
    for (const skill of SHOTCRAFT_SKILLS) {
      for (const bundle of SHOTCRAFT_BUNDLES) {
        for (const file of markdownFiles(path.join(ROOT, bundle, skill)).filter((file) => !file.endsWith("LICENSE.md"))) {
          const body = fs.readFileSync(file, "utf8");
          expect(body, file).not.toMatch(/[㐀-䶿一-鿿]/u);
          expect(body, file).not.toMatch(/\{\{[^}]*\}\}/);
          expect(body, file).not.toMatch(/^\s*(?:ffmpeg|ffprobe)(?:\s|$)/m);
        }
      }
    }
  });

  test("every named media script exists and has a dependency edge", () => {
    const scripts = new Set(fs.readdirSync(path.join(SOURCE, "scripts")));
    for (const skill of SHOTCRAFT_SKILLS) {
      const directory = path.join(ROOT, "skills/media", skill);
      const metadata = frontmatter(path.join(directory, "SKILL.md.tmpl"));
      const body = markdownFiles(directory).filter((file) => !file.endsWith("LICENSE.md"))
        .map((file) => fs.readFileSync(file, "utf8")).join("\n");
      const mentioned = [...body.matchAll(/\b([a-z][a-z0-9_]*\.py)\b/g)].map((match) => match[1]);
      for (const script of mentioned) expect(scripts.has(script), `${skill} names missing script ${script}`).toBe(true);
      if (mentioned.length) expect(metadata["benefits-from"], `${skill} names scripts without trove-ffmpeg`).toContain("trove-ffmpeg");
    }
  });
});

describe("trove-ffmpeg front", () => {
  const front = fs.readFileSync(FRONT, "utf8");

  test("names no script that is missing from scripts/", () => {
    const names = new Set(
      fs
        .readdirSync(path.join(SOURCE, "scripts"))
        .filter((file) => file.endsWith(".py"))
        .map((file) => file.replace(/\.py$/, "")),
    );
    // The front points at `<tool>.py` as a shape, never at a specific tool.
    const mentioned = [...front.matchAll(/\b([a-z][a-z0-9_]*)\.py\b/g)].map((match) => match[1]);
    for (const tool of mentioned) {
      expect(names.has(tool), `front names scripts/${tool}.py, which does not exist`).toBe(true);
    }
  });

  test("restates no flag the manual owns", () => {
    // The manual owns flags. A flag named in the front is a copy that drifts.
    // `${CLAUDE_SKILL_DIR}`, `python3 --version`, and `command -v` are the
    // preflight, not the manual's contract.
    const preflight = ["--version"];
    const named = (front.match(/--[a-z][a-z0-9-]*/g) ?? []).filter(
      (flag) => !preflight.includes(flag),
    );
    expect(named).toEqual([]);
  });

  test("declares no auto-attach globs", () => {
    const plugin = fs.readFileSync(path.join(ROOT, "plugins/trove-media/plugin.yaml"), "utf8");
    expect(plugin.includes("auto_attach")).toBe(false);
    expect(plugin.includes("globs")).toBe(false);
  });
});

describe("trove-ffmpeg vendored bundles", () => {
  test("every bundle carries scripts/templates/ and the upstream notice", () => {
    for (const bundle of BUNDLES) {
      const directory = path.join(ROOT, bundle);
      expect(fs.existsSync(path.join(directory, "SKILL.md")), `${bundle} has no SKILL.md`).toBe(true);
      expect(
        fs.existsSync(path.join(directory, "references/LICENSE.md")),
        `${bundle} has no LICENSE.md`,
      ).toBe(true);

      const templates = path.join(directory, "scripts/templates");
      expect(fs.existsSync(templates), `${bundle} has no scripts/templates/`).toBe(true);
      const files = fs.readdirSync(templates).filter((file) => file.endsWith(".json"));
      expect(files.length, `${bundle} carries ${files.length} template(s)`).toBe(10);
    }
  });

  test("the agents bundle carries references but no generated front", () => {
    // The AGENTS.md projection ships support files only; hosts discover the
    // front elsewhere. That is the existing shape for every plugin.
    const directory = path.join(ROOT, "output/agents/plugins/trove-media/skills/trove-ffmpeg");
    expect(fs.existsSync(path.join(directory, "references/LICENSE.md"))).toBe(true);
    expect(fs.existsSync(path.join(directory, "references/runtime-spec.md"))).toBe(true);
    expect(fs.existsSync(path.join(directory, "SKILL.md.tmpl"))).toBe(false);
  });

  test("the license copy keeps the upstream MIT notice", () => {
    const license = fs.readFileSync(path.join(SOURCE, "references/LICENSE.md"), "utf8");
    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 kajisho5");
    expect(license).toContain("THE SOFTWARE IS PROVIDED");
  });

  test("the generated front carries no unresolved template placeholder", () => {
    // `scripts/*.py` legitimately contains `{{`; the resolver only ever reads
    // templates, so the generated front is the file worth checking.
    const generated = fs.readFileSync(
      path.join(ROOT, "plugins/trove-media/skills/trove-ffmpeg/SKILL.md"),
      "utf8",
    );
    expect(generated.includes("{{")).toBe(false);
  });
});

describe("trove-ffmpeg transforms", () => {
  test("render.py resolves templates beside the script", () => {
    const source = fs.readFileSync(path.join(SOURCE, "scripts/render.py"), "utf8");
    expect(source).toContain('HERE / "templates"');
    expect(source).not.toContain('HERE.parent / "templates"');
  });

  test("_contract.py reads the synced spec, not a root SKILL.md", () => {
    const source = fs.readFileSync(path.join(SOURCE, "scripts/_contract.py"), "utf8");
    expect(source).toContain('ROOT / "references" / "runtime-spec.md"');
    expect(source).not.toContain('ROOT / "SKILL.md"');
  });

  test("every bundle's render.py resolves templates inside the bundle", () => {
    for (const bundle of BUNDLES) {
      const script = fs.readFileSync(path.join(ROOT, bundle, "scripts/render.py"), "utf8");
      expect(script).toContain('HERE / "templates"');
    }
  });
});

describe("trove-ffmpeg contract", () => {
  const bundleContract = path.join(
    ROOT,
    "plugins/trove-media/skills/trove-ffmpeg/scripts/_contract.py",
  );

  const hasPython = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;
  if (!hasPython) console.warn("skipping the contract check: python3 is not on PATH");

  test.skipIf(!hasPython)(
    "the generated Claude bundle reports 42 tools with non-empty examples",
    () => {
      // Run after beforeAll builds the bundle. A broken contract must fail,
      // while only a missing Python interpreter permits a skip.
      const result = spawnSync("python3", [bundleContract, "--json"], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
        timeout: 30_000,
      });
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout) as {
        tools: { name: string; examples: unknown[] }[];
      };
      expect(report.tools.length).toBe(42);
      for (const tool of report.tools) {
        expect(tool.examples.length, `${tool.name} has no examples`).toBeGreaterThan(0);
      }
    },
  );
});

describe("trove-ffmpeg provenance", () => {
  test("the lock row resolves and its offline digests match", () => {
    const manifest = loadUpstreamManifest(ROOT);
    const source = manifest.sources.find((entry) => entry.id === "trove-ffmpeg");
    expect(source).toBeDefined();
    const artifact = source?.artifacts[0];
    expect(artifact?.localPath).toBe("skills/media/trove-ffmpeg");
    expect(artifact?.upstreamPath).toBe(".");
    // Sync advances the active lock; the origin row below retains import evidence.
    expect(artifact?.baseSha).toMatch(/^[0-9a-f]{40}$/);
    expect(artifact?.checkedSha).toBe(artifact?.baseSha);
    expect(repositoryPathAt(".", "upstream_path")).toBe(".");

    const row = manifest.skills.find(
      (entry) => entry.localPath === "skills/media/trove-ffmpeg" && entry.origin === "adapted",
    );
    expect(row?.origin === "adapted" ? row.sourceId : null).toBe("trove-ffmpeg");
    expect(row?.origin === "adapted" ? row.evidenceSha : null).toBe(
      "9ada0f6dca03f1a5f1aa62ea237759c3f8e15321",
    );

    const report = checkOffline(ROOT, manifest);
    const entry = report.artifacts.find((item) => item.artifact === "trove-ffmpeg");
    expect(entry?.conclusion).toBe("no-changes");
  });

  test("the sync lock records both transforms and the local-only front", () => {
    const manifest = loadUpstreamManifest(ROOT);
    const artifact = manifest.sources.find((entry) => entry.id === "trove-ffmpeg")?.artifacts[0];
    expect(artifact?.transforms.map((transform) => transform.path)).toEqual([
      "scripts/render.py",
      "scripts/_contract.py",
    ]);
    expect(artifact?.transforms.map((transform) => transform.minimumOccurrences)).toEqual([1, 2]);
    expect(artifact?.localOnly).toContain("SKILL.md.tmpl");
    expect(artifact?.localOnly).toContain("references/LICENSE.md");
  });
});
