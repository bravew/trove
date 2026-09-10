import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import YAML from "yaml";
import { buildCatalogAdvisory, jaccard, renderCatalogAdvisory, tokenize } from "../scripts/lib/catalog-advisory";
import { lockFilesChangedWithoutSource, orphanLockFiles } from "../scripts/lib/agentic-workflows";

const ROOT = path.resolve(import.meta.dir, "..");

describe("catalog advisory", () => {
  test("ignores boilerplate when comparing skills", () => {
    const tokens = tokenize("Use this skill when the user is working with a thing");
    expect(tokens.has("use")).toBe(false);
    expect(tokens.has("when")).toBe(false);
    expect(tokens.has("working")).toBe(true);
  });

  test("scores overlap symmetrically and bounds it to 0..1", () => {
    const a = tokenize("react performance rendering bundle");
    const b = tokenize("react performance rendering bundle");
    expect(jaccard(a, b)).toBe(1);
    expect(jaccard(a, tokenize("terraform module registry"))).toBe(0);
    expect(jaccard(a, new Set())).toBe(0);
  });

  test("surfaces real catalog overlap at a lowered threshold and stays quiet at the default", () => {
    const loose = buildCatalogAdvisory(ROOT, { overlapThreshold: 0.25 });
    expect(loose.overlap.length).toBeGreaterThan(0);
    // Sorted strongest first, so a maintainer reads the worst pair without scanning.
    expect(loose.overlap[0]!.similarity).toBeGreaterThanOrEqual(loose.overlap.at(-1)!.similarity);
    const strict = buildCatalogAdvisory(ROOT, { overlapThreshold: 0.99 });
    expect(strict.overlap).toEqual([]);
  });

  test("flags every skill as stale when the threshold is zero and none when it is huge", () => {
    expect(buildCatalogAdvisory(ROOT, { stalenessThresholdDays: 0 }).stale.length).toBeGreaterThan(0);
    expect(buildCatalogAdvisory(ROOT, { stalenessThresholdDays: 100_000 }).stale).toEqual([]);
  });

  test("renders a report that says it does not block", () => {
    const markdown = renderCatalogAdvisory(buildCatalogAdvisory(ROOT, { overlapThreshold: 0.99, stalenessThresholdDays: 100_000 }));
    expect(markdown).toContain("Advisory only");
    expect(markdown).toContain("No skill pair crosses the overlap threshold.");
    expect(markdown).toContain("Age alone is not decay");
  });
});

describe("agentic workflow guard", () => {
  test("rejects a generated lock workflow with no source", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-"));
    fs.writeFileSync(path.join(dir, "orphan.lock.yml"), "name: x\n");
    expect(orphanLockFiles(dir)).toEqual(["orphan.lock.yml"]);
    fs.writeFileSync(path.join(dir, "orphan.md"), "# source\n");
    expect(orphanLockFiles(dir)).toEqual([]);
  });

  test("rejects a lock workflow edited without its source", () => {
    expect(lockFilesChangedWithoutSource([".github/workflows/sync.lock.yml"]))
      .toEqual([".github/workflows/sync.lock.yml"]);
    expect(lockFilesChangedWithoutSource([".github/workflows/sync.lock.yml", ".github/workflows/sync.md"]))
      .toEqual([]);
  });

  test("the repository currently ships no compiled agentic workflow", () => {
    expect(orphanLockFiles(path.join(ROOT, ".github", "workflows"))).toEqual([]);
  });

  test("the guard runs in required validation, and the advisory does not", () => {
    const validate = fs.readFileSync(path.join(ROOT, ".github", "workflows", "validate.yml"), "utf-8");
    expect(validate).toContain("scripts/validate-agentic-workflows.ts");
    const advisory = YAML.parse(fs.readFileSync(path.join(ROOT, ".github", "workflows", "catalog-advisory.yml"), "utf-8")) as Record<string, any>;
    expect(advisory.on.pull_request).toBeUndefined();
    expect(advisory.permissions).toEqual({ contents: "read" });
  });
});

describe("upstream pilot provenance", () => {
  const manifest = YAML.parse(fs.readFileSync(path.join(ROOT, "upstream.yaml"), "utf-8")) as Record<string, any>;
  const source = (manifest.sources as any[]).find((entry) => entry.id === "awesome-copilot");

  test("records both pilots with a full base SHA, digests, license, and a patch", () => {
    expect(source).toBeDefined();
    expect(source.license.expression).toBe("MIT");
    const ids = (source.artifacts as any[]).map((artifact) => artifact.id).sort();
    expect(ids).toEqual(["trove-docs-sync-audit", "trove-test-gap-audit"]);
    for (const artifact of source.artifacts as any[]) {
      expect(artifact.base_sha).toMatch(/^[0-9a-f]{40}$/);
      expect(artifact.base_tree_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(artifact.local_tree_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(artifact.patch_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(artifact.patches).toHaveLength(1);
      expect(fs.existsSync(path.join(ROOT, artifact.patches[0]))).toBe(true);
      expect(artifact.status).toBe("active");
    }
  });

  test("records the declined candidate rather than dropping it silently", () => {
    expect(manifest.not_vendored["awesome-copilot"]).toContain("github-actions-hardening");
  });

  test("keeps the pilot at no more than three candidates", () => {
    expect((source.artifacts as any[]).length).toBeLessThanOrEqual(3);
  });

  test("selects only canonical skill content, never generated workflows or site assets", () => {
    for (const artifact of source.artifacts as any[]) {
      for (const pattern of artifact.include as string[]) {
        expect(pattern === "SKILL.md" || pattern.startsWith("references/") || pattern.startsWith("scripts/")).toBe(true);
      }
    }
  });
});

describe("bundled skill pruning", () => {
  test("a plugin bundles exactly the skills its manifest lists", () => {
    // Regression: removing a skill from plugin.yaml used to leave its bundled
    // copy behind, and the freshness dry-run could not see it because a
    // generator never writes an orphan.
    for (const plugin of fs.readdirSync(path.join(ROOT, "plugins"), { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      const manifestPath = path.join(ROOT, "plugins", plugin.name, "plugin.yaml");
      const skillsRoot = path.join(ROOT, "plugins", plugin.name, "skills");
      if (!fs.existsSync(manifestPath) || !fs.existsSync(skillsRoot)) continue;
      const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf-8")) as { skills?: Array<{ path: string }> };
      const listed = new Set((manifest.skills ?? []).map((skill) => path.basename(skill.path)));
      const bundled = fs.readdirSync(skillsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      expect(bundled.filter((name) => !listed.has(name))).toEqual([]);
    }
  });
});
