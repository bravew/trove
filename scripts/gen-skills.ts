#!/usr/bin/env bun
/**
 * Stage 1: Generate per-host skill and rule artifacts from `SKILL.md.tmpl`.
 *
 * Each host declares which projection kinds it wants (see `hosts/*.ts`):
 *
 *   - `skill` → `SKILL.md` for Claude (in-place), Codex, Cursor, and
 *     OpenCode.
 *   - `rule`  → Cursor `.mdc` Project Rule under `output/cursor/rules/`
 *     only when the skill has activation globs or is an explicit
 *     always-on anchor.
 *
 * The `agents-section` projection (scoped AGENTS.md assembly) is emitted
 * by `gen-marketplace.ts`, which already loads plugin metadata for the
 * marketplace catalog and so naturally owns plugin-scoped output.
 *
 * Usage:
 *   bun run build:skills                    # All hosts
 *   bun run build:skills -- --host claude   # One host
 *   bun run build:skills -- --dry-run       # Freshness check, no writes
 */

import * as fs from "fs";
import * as path from "path";
import { ALL_HOSTS, getHost } from "../hosts/index";
import type { HostConfig, ProjectionKind } from "../hosts/types";
import {
  ROOT,
  GENERATED_HEADER,
  findTemplates,
  loadAndParseTemplate,
  applyContentRewrites,
  injectGeneratedHeader,
  type TemplateFile,
  type ParsedTemplate,
} from "./lib/skill-parser";
import { emitFrontmatter, projectFrontmatter } from "./lib/projection";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Host arg parsing ────────────────────────────────────────

function parseHostArg(): HostConfig[] {
  const hostArg = process.argv.find((a) => a.startsWith("--host"));
  if (!hostArg) return ALL_HOSTS;

  const val = hostArg.includes("=")
    ? hostArg.split("=")[1]
    : process.argv[process.argv.indexOf(hostArg) + 1];

  if (val === "all") return ALL_HOSTS;
  return [getHost(val)];
}

// ─── Skill projection (Claude, Codex) ───────────────────────

interface SkillArtifact {
  outputPath: string;
  content: string;
}

const SUPPORT_DIRS = ["references", "scripts"] as const;

/**
 * Emit a host-native `SKILL.md`.
 *
 * The frontmatter is rebuilt from the normalized authoring contract through
 * the host's projection profile rather than edited in place, so a host only
 * ever receives fields its profile allows.
 */
function projectSkill(template: TemplateFile, parsed: ParsedTemplate, host: HostConfig): SkillArtifact {
  const fields = projectFrontmatter(parsed.authoring, {
    profile: host.skillProjection,
    hostName: host.name,
    supportsToolAllowlist: host.capabilities.supportsToolAllowlistMetadata,
  });
  let content = `${emitFrontmatter(fields)}${parsed.body}`;
  content = applyContentRewrites(content, host);
  content = injectGeneratedHeader(content, path.basename(template.path));

  let outputPath: string;
  if (host.name === "claude") {
    outputPath = template.path.replace(/\.tmpl$/, "");
  } else {
    const subdir = host.skillOutputDir ?? "";
    outputPath = path.join(ROOT, "output", host.name, subdir, template.skillName, "SKILL.md");
  }
  return { outputPath, content };
}

/**
 * `user-invocable: false` marks a skill the user cannot summon by name, so
 * Cursor's only way to deliver it is an always-on rule. This is distinct from
 * `activation.manual`, which is the opposite signal (see projection.ts).
 */
function isModelOnly(parsed: ParsedTemplate): boolean {
  return parsed.authoring.userInvocable === false;
}

// ─── Cursor `.mdc` rule projection ──────────────────────────

interface RuleArtifact {
  outputPath: string;
  content: string;
}

function projectCursorRule(template: TemplateFile, parsed: ParsedTemplate, host: HostConfig): RuleArtifact {
  // Drop the canonical SKILL.md frontmatter; replace with MDC frontmatter.
  // Normalize leading whitespace to exactly one blank line so the auto-generated
  // header sits one line above the first content heading — without that blank
  // line some Markdown renderers don't recognize the heading.
  let body = parsed.body.replace(/^\n+/, "\n");
  body = applyContentRewrites(body, host);

  const description = parsed.authoring.description;
  const globs = parsed.authoring.globs;
  const modelOnly = isModelOnly(parsed);

  // Selection model:
  //   activation.globs present → Auto Attached  (globs set, alwaysApply: false)
  //   user-invocable, no globs → Manual         (alwaysApply: false, no globs)
  //   no globs, not invocable  → Always         (bootstrap-only fallback)
  // The Always branch is deliberately narrow so only discipline anchors such
  // as using-trove burn session context on every Cursor request.
  //
  // Format follows cursor.com/docs/context/rules:
  //   description: quoted string (Cursor's MDC parser is not strict YAML;
  //     quoting protects against punctuation in the description)
  //   globs: comma-separated unquoted patterns ("docs/**/*.md, docs/**/*.mdx")
  //     — NOT a YAML array, which the docs explicitly do not show.
  //   alwaysApply: unquoted boolean
  const lines: string[] = ["---"];
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  if (globs.length > 0) lines.push(`globs: ${globs.join(", ")}`);
  lines.push(`alwaysApply: ${globs.length === 0 && modelOnly ? "true" : "false"}`);
  lines.push("---", "");

  const header = GENERATED_HEADER.replace("{{SOURCE}}", path.basename(template.path));
  const content = `${lines.join("\n")}${header}${body}`;

  const subdir = host.ruleOutputDir ?? "rules";
  const outputPath = path.join(ROOT, "output", host.name, subdir, `${template.skillName}.mdc`);
  return { outputPath, content };
}

function shouldProjectCursorRule(parsed: ParsedTemplate): boolean {
  return parsed.authoring.globs.length > 0 || isModelOnly(parsed);
}

// ─── Output writing ─────────────────────────────────────────

function writeArtifact(outputPath: string, content: string, kind: ProjectionKind): { stale: boolean } {
  const relOutput = path.relative(ROOT, outputPath);
  if (DRY_RUN) {
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf-8") : "";
    if (existing !== content) {
      console.log(`  STALE: ${relOutput} [${kind}]`);
      return { stale: true };
    }
    console.log(`  FRESH: ${relOutput} [${kind}]`);
    return { stale: false };
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
  console.log(`  GENERATED: ${relOutput} [${kind}]`);
  return { stale: false };
}

function listFilesRecursive(dir: string, baseDir = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full, baseDir));
    } else {
      files.push(path.relative(baseDir, full));
    }
  }
  return files.sort();
}

function listSupportFiles(templateDir: string): Array<{ relPath: string; sourcePath: string }> {
  const files: Array<{ relPath: string; sourcePath: string }> = [];
  for (const supportDir of SUPPORT_DIRS) {
    const root = path.join(templateDir, supportDir);
    for (const rel of listFilesRecursive(root)) {
      files.push({
        relPath: path.join(supportDir, rel),
        sourcePath: path.join(root, rel),
      });
    }
  }
  return files.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function listGeneratedSupportFiles(outputSkillDir: string): string[] {
  const files: string[] = [];
  for (const supportDir of SUPPORT_DIRS) {
    const root = path.join(outputSkillDir, supportDir);
    for (const rel of listFilesRecursive(root)) {
      files.push(path.join(supportDir, rel));
    }
  }
  return files.sort();
}

function syncSupportFiles(template: TemplateFile, outputSkillDir: string, host: HostConfig): boolean {
  if (host.name === "claude") return false;

  const expected = listSupportFiles(path.dirname(template.path));
  const existing = listGeneratedSupportFiles(outputSkillDir);
  if (expected.length === 0 && existing.length === 0) return false;

  const relDir = path.relative(ROOT, outputSkillDir);
  if (DRY_RUN) {
    let stale = false;
    const expectedRelPaths = new Set(expected.map((file) => file.relPath));

    for (const file of expected) {
      const destPath = path.join(outputSkillDir, file.relPath);
      const source = fs.readFileSync(file.sourcePath, "utf-8");
      const dest = fs.existsSync(destPath) ? fs.readFileSync(destPath, "utf-8") : "";
      if (source !== dest) {
        console.log(`  STALE: ${path.relative(ROOT, destPath)} [support]`);
        stale = true;
      }
    }

    for (const rel of existing) {
      if (expectedRelPaths.has(rel)) continue;
      console.log(`  STALE: ${path.relative(ROOT, path.join(outputSkillDir, rel))} [support:extra]`);
      stale = true;
    }

    if (!stale) console.log(`  FRESH: ${relDir}/support files [support]`);
    return stale;
  }

  for (const supportDir of SUPPORT_DIRS) {
    const dest = path.join(outputSkillDir, supportDir);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  }

  for (const file of expected) {
    const destPath = path.join(outputSkillDir, file.relPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(file.sourcePath, destPath);
  }

  if (expected.length > 0) {
    console.log(`  COPIED: ${expected.length} support file(s) to ${relDir}/`);
  }
  return false;
}

/**
 * Wipe a host's per-skill / per-rule output before regenerating, so renames
 * and removals don't leave orphaned files. Claude is left alone because its
 * artifacts live next to the source templates.
 */
function cleanHostOutput(host: HostConfig): void {
  if (host.name === "claude") return;
  for (const sub of [host.skillOutputDir, host.ruleOutputDir]) {
    if (!sub) continue;
    const dir = path.join(ROOT, "output", host.name, sub);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Main ───────────────────────────────────────────────────

const hostsToRun = parseHostArg();
const templates = findTemplates();
let hasErrors = false;

if (!DRY_RUN) {
  for (const host of hostsToRun) cleanHostOutput(host);
}

for (const host of hostsToRun) {
  const skillKinds = host.projections.filter((k) => k === "skill" || k === "rule");
  if (skillKinds.length === 0) {
    // This host's only projection is `agents-section`, which is owned by
    // gen-marketplace.ts — nothing to do here.
    continue;
  }

  console.log(`\n── ${host.displayName} ──`);
  const budget: Array<{ artifact: string; lines: number; tokens: number; kind: ProjectionKind }> = [];

  for (const template of templates) {
    try {
      const parsed = loadAndParseTemplate(template);

      for (const kind of skillKinds) {
        if (kind === "rule" && !shouldProjectCursorRule(parsed)) continue;

        let artifact: SkillArtifact | RuleArtifact;
        if (kind === "skill") {
          artifact = projectSkill(template, parsed, host);
        } else {
          artifact = projectCursorRule(template, parsed, host);
        }
        const { stale } = writeArtifact(artifact.outputPath, artifact.content, kind);
        if (stale) hasErrors = true;
        if (kind === "skill") {
          const supportStale = syncSupportFiles(template, path.dirname(artifact.outputPath), host);
          if (supportStale) hasErrors = true;
        }
        budget.push({
          artifact: path.relative(ROOT, artifact.outputPath),
          lines: artifact.content.split("\n").length,
          tokens: Math.round(artifact.content.length / 4),
          kind,
        });
      }
    } catch (e) {
      console.error(`  ERROR: ${path.relative(ROOT, template.path)}: ${(e as Error).message}`);
      hasErrors = true;
    }
  }

  if (!DRY_RUN && budget.length > 0) {
    budget.sort((a, b) => b.lines - a.lines);
    const totalLines = budget.reduce((s, t) => s + t.lines, 0);
    const totalTokens = budget.reduce((s, t) => s + t.tokens, 0);
    console.log("");
    console.log(`  Token Budget (${host.displayName})`);
    console.log(`  ${"═".repeat(60)}`);
    for (const t of budget) {
      const label = `${t.kind.padEnd(6)} ${t.artifact}`;
      console.log(`    ${label.padEnd(58)} ${String(t.lines).padStart(5)} L  ~${String(t.tokens).padStart(6)} tok`);
    }
    console.log(`  ${"─".repeat(60)}`);
    console.log(`    ${"TOTAL".padEnd(58)} ${String(totalLines).padStart(5)} L  ~${String(totalTokens).padStart(6)} tok`);
  }
}

if (DRY_RUN && hasErrors) {
  console.error("\nGenerated artifacts are stale. Run: bun run build:skills");
  process.exit(1);
}

console.log("\n✓ Skills generation complete.");
