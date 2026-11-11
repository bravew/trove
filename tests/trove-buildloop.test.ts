import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildOnceForTests } from "./helpers/build";

const ROOT = path.resolve(import.meta.dir, "..");
const SKILLS = ["trove-take-cut", "trove-broll-ingest", "trove-video-edit"];

/** Every bundle that carries the skill payload. The AGENTS.md projection is
 * references only, for every skill, so it never carries assets or scripts. */
const BUNDLE_ROOTS = [
  "plugins/trove-media/skills",
  "plugins/trove-media/.agents/skills",
  "plugins/trove-media/.copilot/skills",
  "output/cursor/.agents/skills",
  "output/codex/.agents/skills",
  "output/opencode/.agents/skills",
  "output/gemini/.agents/skills",
  "output/gemini/plugins/trove-media/skills",
  "output/copilot/.agents/skills",
];

const LUTS = [
  "cinematic-rec709.cube",
  "cinematic-rec709-soft.cube",
  "cinematic-slog3.cube",
  "cinematic-slog3-soft.cube",
];

const MEDIA = /\.(mp3|wav|mp4|mov|png|jpe?g|webp|gif)$/i;

beforeAll(buildOnceForTests, 120_000);

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    // Dependencies are installed locally to typecheck and never committed.
    if (entry.name === "node_modules") return [];
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? files(absolute) : [absolute];
  });
}

describe("buildloop rewrites", () => {
  test("the four LUTs are byte-identical in every bundle", () => {
    const canonical = path.join(ROOT, "skills/media/trove-broll-ingest/assets/luts");
    for (const lut of LUTS) {
      const bytes = fs.readFileSync(path.join(canonical, lut));
      expect(bytes.length, lut).toBeGreaterThan(0);
      for (const root of BUNDLE_ROOTS) {
        const copy = path.join(ROOT, root, "trove-broll-ingest/assets/luts", lut);
        expect(fs.existsSync(copy), copy).toBe(true);
        expect(fs.readFileSync(copy).equals(bytes), copy).toBe(true);
      }
    }
  });

  test("no audio, video, or image binaries ship", () => {
    for (const skill of SKILLS) {
      const shipped = files(path.join(ROOT, "skills/media", skill)).filter((file) => MEDIA.test(file));
      expect(shipped, skill).toEqual([]);
    }
  });

  test("nothing reads .env or writes to the install directory", () => {
    for (const skill of SKILLS) {
      for (const file of files(path.join(ROOT, "skills/media", skill, "scripts"))) {
        const source = fs.readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/\.env\b/);
        expect(source, file).not.toMatch(/~\/\.claude/);
      }
    }
  });

  test("every script answers --help", () => {
    const scripts = SKILLS.flatMap((skill) =>
      files(path.join(ROOT, "skills/media", skill, "scripts")).filter((file) => file.endsWith(".py")),
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const result = spawnSync("python3", [script, "--help"], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.length, script).toBeGreaterThan(0);
    }
  });
});
