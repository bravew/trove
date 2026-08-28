/**
 * Projection snapshot tests.
 *
 * These tests guard the P1 exit criteria: each host emits the right
 * artifact kind from the canonical skill templates, and scoped AGENTS
 * output stays scope-isolated. The build is run once at module load and
 * its outputs are read from the filesystem; that keeps the assertions
 * close to what consumers will actually see.
 */

import { test, expect, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { buildOnceForTests } from "./helpers/build";

const ROOT = path.resolve(import.meta.dir, "..");
const OUTPUT = path.join(ROOT, "output");

beforeAll(() => {
  // Always rebuild so tests reflect the current generator behavior even
  // when run in isolation (e.g., `bun test tests/projection.test.ts`).
  // We need both stages: gen-skills emits skill + rule artifacts, and
  // gen-marketplace emits the scoped AGENTS files. gen-plugins runs in
  // between but its output isn't asserted here; the full `build` script
  // exercises every projection path.
  buildOnceForTests();
}, 120_000);

// ─── Cursor skill and `.mdc` rule projection ───────────────

test("cursor: emits SKILL.md files under output/cursor/.agents/skills/", () => {
  const skillPath = path.join(OUTPUT, "cursor", ".agents", "skills", "trove-python", "SKILL.md");
  expect(fs.existsSync(skillPath)).toBe(true);

  const content = fs.readFileSync(skillPath, "utf-8");
  const fm = content.slice(4, content.indexOf("\n---", 4));
  expect(fm).toMatch(/^name: trove-python$/m);
  expect(fm).toMatch(/^description: ".+"$/m);
  expect(fm).toMatch(/^paths:$/m);
  expect(fm).toMatch(/^\s+- "\*\*\/\*\.py"$/m);
  expect(fm).not.toMatch(/^version:/m);
  expect(fm).not.toMatch(/^activation:/m);
  expect(fm).not.toMatch(/^triggers:/m);
  expect(fm).not.toMatch(/^user-invocable:/m);
});

test("cursor: emits .mdc rule files under output/cursor/rules/", () => {
  const rulesDir = path.join(OUTPUT, "cursor", "rules");
  expect(fs.existsSync(rulesDir)).toBe(true);

  const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".mdc"));
  expect(files.length).toBeGreaterThan(0);
  expect(files).toContain("trove-python.mdc");
  expect(files).not.toContain("trove-review.mdc");
});

test("cursor: trove-python rule has MDC frontmatter mapping paths→globs", () => {
  const rule = fs.readFileSync(path.join(OUTPUT, "cursor", "rules", "trove-python.mdc"), "utf-8");
  // Frontmatter shape
  expect(rule.startsWith("---\n")).toBe(true);

  const fmEnd = rule.indexOf("\n---", 4);
  expect(fmEnd).toBeGreaterThan(0);
  const fm = rule.slice(4, fmEnd);

  // Cursor's docs prescribe: description quoted, globs comma-separated and
  // unquoted, alwaysApply unquoted boolean. See cursor.com/docs/context/rules.
  expect(fm).toMatch(/^description: ".+"$/m);
  expect(fm).toMatch(/^globs: \*\*\/\*\.py$/m);
  expect(fm).toMatch(/^alwaysApply: false$/m);

  // The original Claude-only frontmatter must NOT leak through.
  expect(fm).not.toMatch(/^name:/m);
  expect(fm).not.toMatch(/^paths:/m);
  expect(fm).not.toMatch(/^user-invocable:/m);
});

test("cursor: multiple globs are emitted as a single comma-separated string", () => {
  // trove-react has paths "**/*.tsx,**/*.jsx" — the rule must emit them as
  // a single `globs:` line per Cursor's MDC docs, not as a YAML array.
  const rule = fs.readFileSync(path.join(OUTPUT, "cursor", "rules", "trove-react.mdc"), "utf-8");
  const fm = rule.slice(4, rule.indexOf("\n---", 4));
  expect(fm).toMatch(/^globs: \*\*\/\*\.tsx, \*\*\/\*\.jsx$/m);
  // Must not use YAML array syntax.
  expect(fm).not.toMatch(/^\s*- /m);
});

test("cursor: rule body retains skill content but not Claude frontmatter", () => {
  const rule = fs.readFileSync(path.join(OUTPUT, "cursor", "rules", "trove-python.mdc"), "utf-8");
  expect(rule).toContain("Python / FastAPI Conventions");
  // Generated header is preserved in the body so authors can trace the source.
  expect(rule).toContain("AUTO-GENERATED from SKILL.md.tmpl");
});

test("cursor: pathless procedural skills emit SKILL.md but no duplicate rule", () => {
  const skillPath = path.join(OUTPUT, "cursor", ".agents", "skills", "trove-review", "SKILL.md");
  expect(fs.existsSync(skillPath)).toBe(true);
  expect(fs.existsSync(path.join(OUTPUT, "cursor", "rules", "trove-review.mdc"))).toBe(false);
});

test("host skill outputs include support references beside SKILL.md", () => {
  for (const hostSkillRoot of [
    path.join(OUTPUT, "cursor", ".agents", "skills"),
    path.join(OUTPUT, "codex", ".agents", "skills"),
    path.join(OUTPUT, "opencode", ".agents", "skills"),
    path.join(OUTPUT, "gemini", ".agents", "skills"),
  ]) {
    expect(
      fs.existsSync(
        path.join(hostSkillRoot, "trove-react-best-practices", "references", "bundle-dynamic-imports.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(hostSkillRoot, "trove-react-view-transitions", "references", "implementation.md")),
    ).toBe(true);
  }
});

test("cursor: intent-triggered React performance skill emits no auto-attach rule", () => {
  expect(
    fs.existsSync(path.join(OUTPUT, "cursor", "rules", "trove-react-best-practices.mdc")),
  ).toBe(false);
  expect(
    fs.existsSync(path.join(ROOT, "plugins", "trove-dev", "rules", "trove-react-best-practices.mdc")),
  ).toBe(false);
});

test("cursor: explicit non-invocable anchor emits alwaysApply true", () => {
  const rule = fs.readFileSync(path.join(OUTPUT, "cursor", "rules", "using-trove.mdc"), "utf-8");
  const fm = rule.slice(4, rule.indexOf("\n---", 4));
  expect(fm).not.toMatch(/^globs:/m);
  expect(fm).toMatch(/^alwaysApply: true/m);

  const skill = fs.readFileSync(
    path.join(OUTPUT, "cursor", ".agents", "skills", "using-trove", "SKILL.md"),
    "utf-8",
  );
  // Cursor already receives this anchor as an always-on rule, so the skill
  // copy declares manual-only explicitly via `host-overrides.cursor`. It is
  // NOT derived from `user-invocable: false`, which means the opposite.
  const skillFm = skill.slice(4, skill.indexOf("\n---", 4));
  expect(skillFm).toMatch(/^disable-model-invocation: true$/m);
});

test("cursor: `user-invocable: false` alone never becomes manual-only", () => {
  // Regression guard for F2. trove-python is model-only (user-invocable:
  // false) with no manual-only declaration; translating one into the other
  // inverts the skill's meaning in Cursor.
  const skill = fs.readFileSync(
    path.join(OUTPUT, "cursor", ".agents", "skills", "trove-python", "SKILL.md"),
    "utf-8",
  );
  expect(skill.slice(4, skill.indexOf("\n---", 4))).not.toMatch(/^disable-model-invocation:/m);
});

test("plugin manifests: Claude and Cursor hook commands use their own root env vars", () => {
  const claude = JSON.parse(
    fs.readFileSync(path.join(ROOT, "plugins", "trove-workflow", ".claude-plugin", "plugin.json"), "utf-8"),
  );
  const cursor = JSON.parse(
    fs.readFileSync(path.join(ROOT, "plugins", "trove-workflow", ".cursor-plugin", "plugin.json"), "utf-8"),
  );
  const claudeCommand = claude.hooks.SessionStart[0].hooks[0].command;
  const cursorCommand = cursor.hooks.SessionStart[0].hooks[0].command;

  expect(claudeCommand).toBe("${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh");
  expect(cursorCommand).toBe("${CURSOR_PLUGIN_ROOT}/hooks/session-start.sh");
});

test("cursor plugin manifest points to Cursor-projected SKILL.md files", () => {
  const cursor = JSON.parse(
    fs.readFileSync(path.join(ROOT, "plugins", "trove-dev", ".cursor-plugin", "plugin.json"), "utf-8"),
  );
  expect(cursor.skills).toContain("./.agents/skills/trove-python");
  expect(cursor.skills).not.toContain("./skills/trove-python");

  const bundledSkill = path.join(ROOT, "plugins", "trove-dev", ".agents", "skills", "trove-python", "SKILL.md");
  expect(fs.existsSync(bundledSkill)).toBe(true);
  const content = fs.readFileSync(bundledSkill, "utf-8");
  const fm = content.slice(4, content.indexOf("\n---", 4));
  expect(fm).toMatch(/^paths:$/m);
  expect(fm).not.toMatch(/^version:/m);
});

// ─── No legacy `.cursorrules` ──────────────────────────────

test("cursor: no legacy .cursorrules artifact exists", () => {
  const candidates = [
    path.join(OUTPUT, "cursor", ".cursorrules"),
    path.join(OUTPUT, ".cursorrules"),
    path.join(ROOT, ".cursorrules"),
  ];
  for (const c of candidates) {
    expect(fs.existsSync(c)).toBe(false);
  }
});

// ─── Codex skill projection ────────────────────────────────

test("codex: emits skills under .agents/skills/<skill>/SKILL.md", () => {
  const codexSkill = path.join(OUTPUT, "codex", ".agents", "skills", "trove-python", "SKILL.md");
  expect(fs.existsSync(codexSkill)).toBe(true);

  const content = fs.readFileSync(codexSkill, "utf-8");
  expect(content.startsWith("---\n")).toBe(true);
  expect(content).toContain("name: trove-python");
  expect(content).toContain("Python / FastAPI Conventions");

  // `paths:` is Cursor-only metadata in the skill body context — Codex
  // strips it so plugin/integration metadata does not leak in.
  const fmEnd = content.indexOf("\n---", 4);
  const fm = content.slice(4, fmEnd);
  expect(fm).not.toMatch(/^paths:/m);
});

test("codex: legacy flat output/codex/<skill>/SKILL.md path is gone", () => {
  // Pre-P1 Codex skills lived directly under output/codex/<skill>/SKILL.md.
  // After cleanup they should only exist under `.agents/skills/`.
  const legacy = path.join(OUTPUT, "codex", "trove-python", "SKILL.md");
  expect(fs.existsSync(legacy)).toBe(false);
});

// ─── AGENTS scoped projection ──────────────────────────────

test("agents: root AGENTS.md is concise and links to scoped files", () => {
  const root = fs.readFileSync(path.join(OUTPUT, "agents", "AGENTS.md"), "utf-8");

  // Root must stay index-shaped, not become another mega-file. We pin a
  // generous ceiling (50 lines) so adding plugins doesn't fail the test
  // gratuitously, but flagrantly inlining skill bodies still trips it.
  const lineCount = root.split("\n").length;
  expect(lineCount).toBeLessThan(50);

  // Must point at scoped files for each plugin we know about.
  expect(root).toContain("[`plugins/trove-dev/AGENTS.md`](./plugins/trove-dev/AGENTS.md)");
  expect(root).toContain("[`plugins/trove-design/AGENTS.md`](./plugins/trove-design/AGENTS.md)");

  // Index must NOT inline a skill body — pick a phrase that only appears in
  // skill content, never in the root.
  expect(root).not.toContain("Python / FastAPI Conventions");
});

test("agents: per-plugin scoped AGENTS.md exists for each plugin", () => {
  const pluginsDir = path.join(OUTPUT, "agents", "plugins");
  for (const pluginName of ["trove-dev", "trove-design", "trove-product", "trove-infra", "trove-security", "trove-workflow"]) {
    const file = path.join(pluginsDir, pluginName, "AGENTS.md");
    expect(fs.existsSync(file)).toBe(true);
  }
});

test("agents: scoped files do not duplicate skills from other plugins", () => {
  // trove-dev owns trove-python; trove-design must not contain trove-python's content.
  const designFile = fs.readFileSync(
    path.join(OUTPUT, "agents", "plugins", "trove-design", "AGENTS.md"),
    "utf-8",
  );
  expect(designFile).not.toContain("Python / FastAPI Conventions");
  expect(designFile).not.toContain("## trove-python");

  // trove-design owns trove-a11y; trove-product must not contain it.
  const productFile = fs.readFileSync(
    path.join(OUTPUT, "agents", "plugins", "trove-product", "AGENTS.md"),
    "utf-8",
  );
  expect(productFile).not.toContain("## trove-a11y");
});

test("agents: scoped file contains only its own skills", () => {
  const devFile = fs.readFileSync(
    path.join(OUTPUT, "agents", "plugins", "trove-dev", "AGENTS.md"),
    "utf-8",
  );
  expect(devFile).toContain("## trove-python");
  expect(devFile).toContain("## trove-react");
  expect(devFile).toContain("## trove-commit");
  // Skills owned by other plugins must be absent.
  expect(devFile).not.toContain("## trove-a11y");
  expect(devFile).not.toContain("## trove-spec");
});

// ─── Auto-attach glob inventory (F1) ───────────────────────
//
// Before the fix, Claude dropped `paths` entirely: a skill could declare
// `auto_attach.globs` in plugin.yaml and never auto-attach. These assertions
// tie the emitted `paths` to the declared inventory in both directions, so
// neither a silently dropped glob nor a silently widened one can ship.

function claudePaths(skillMdPath: string): string[] {
  const content = fs.readFileSync(skillMdPath, "utf-8");
  const fm = content.slice(4, content.indexOf("\n---", 4));
  const match = fm.match(/^paths:\n((?:\s+- .*\n?)+)/m);
  if (!match) return [];
  return [...match[1].matchAll(/^\s+- "(.+)"$/gm)].map((m) => m[1]);
}

test("claude: every declared auto_attach glob is emitted as `paths`", () => {
  const YAML = require("yaml");
  const pluginsDir = path.join(ROOT, "plugins");
  let checked = 0;

  for (const plugin of fs.readdirSync(pluginsDir)) {
    const yamlPath = path.join(pluginsDir, plugin, "plugin.yaml");
    if (!fs.existsSync(yamlPath)) continue;
    const manifest = YAML.parse(fs.readFileSync(yamlPath, "utf-8"));

    for (const entry of manifest.skills ?? []) {
      const globs: string[] = entry.auto_attach?.globs ?? [];
      const name = path.basename(entry.path);
      const skillMd = path.join(pluginsDir, plugin, "skills", name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;

      // Both directions: declared globs are emitted, and nothing else is.
      expect({ name, paths: claudePaths(skillMd) }).toEqual({ name, paths: globs });
      checked++;
    }
  }

  expect(checked).toBeGreaterThan(0);
});

test("claude: skills with no declared globs emit no `paths`", () => {
  // A skill that never auto-attached must not start auto-attaching.
  for (const name of ["trove-commit", "trove-review", "using-trove"]) {
    const matches = [
      path.join(ROOT, "plugins", "trove-dev", "skills", name, "SKILL.md"),
      path.join(ROOT, "plugins", "trove-workflow", "skills", name, "SKILL.md"),
    ].filter((p) => fs.existsSync(p));
    expect(matches.length).toBeGreaterThan(0);
    for (const skillMd of matches) expect(claudePaths(skillMd)).toEqual([]);
  }
});

test("cursor: skill `paths` and rule `globs` carry the same inventory", () => {
  for (const name of ["trove-python", "trove-react", "trove-typescript", "trove-a11y"]) {
    const skill = fs.readFileSync(
      path.join(OUTPUT, "cursor", ".agents", "skills", name, "SKILL.md"),
      "utf-8",
    );
    const skillFm = skill.slice(4, skill.indexOf("\n---", 4));
    const skillGlobs = [...skillFm.matchAll(/^\s+- "(.+)"$/gm)].map((m) => m[1]);

    const rule = fs.readFileSync(path.join(OUTPUT, "cursor", "rules", `${name}.mdc`), "utf-8");
    const ruleFm = rule.slice(4, rule.indexOf("\n---", 4));
    const ruleGlobs = (ruleFm.match(/^globs: (.+)$/m)?.[1] ?? "").split(", ").filter(Boolean);

    expect(ruleGlobs).toEqual(skillGlobs);
    expect(skillGlobs.length).toBeGreaterThan(0);
  }
});
