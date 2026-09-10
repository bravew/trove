import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { maintainedSkills } from "./eval-structure";
import { parseTemplate } from "./skill-parser";

/**
 * Deterministic catalog advisories: overlap between skills and staleness by
 * last touch. These are reports, not gates. Semantic duplicate detection is a
 * judgment call and belongs in an agentic workflow; this is the cheap,
 * reproducible signal that tells a maintainer where to look first.
 */

export interface OverlapFinding {
  a: string;
  b: string;
  similarity: number;
  sharedTriggers: string[];
}

export interface StalenessFinding {
  skill: string;
  lastTouchedAt: string;
  daysSinceTouch: number;
}

export interface CatalogAdvisory {
  schemaVersion: "trove.catalog-advisory.v1";
  generatedAt: string;
  overlapThreshold: number;
  stalenessThresholdDays: number;
  overlap: OverlapFinding[];
  stale: StalenessFinding[];
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "in", "is", "it", "its",
  "not", "of", "on", "or", "that", "the", "this", "to", "use", "used", "using", "when", "with",
  "skill", "trove", "your", "you",
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function skillDirectory(root: string, skill: string): string | null {
  for (const category of fs.readdirSync(path.join(root, "skills"))) {
    const candidate = path.join(root, "skills", category, skill);
    if (fs.existsSync(path.join(candidate, "SKILL.md.tmpl"))) return candidate;
  }
  return null;
}

function lastTouchedAt(root: string, directory: string): string {
  const output = execFileSync("git", ["log", "-1", "--format=%cI", "--", path.relative(root, directory)], {
    cwd: root,
    encoding: "utf-8",
  }).trim();
  return output || new Date().toISOString();
}

export function buildCatalogAdvisory(
  root: string,
  options: { now?: string; overlapThreshold?: number; stalenessThresholdDays?: number } = {},
): CatalogAdvisory {
  const now = options.now ?? new Date().toISOString();
  const overlapThreshold = options.overlapThreshold ?? 0.35;
  const stalenessThresholdDays = options.stalenessThresholdDays ?? 365;

  const profiles: Array<{ skill: string; tokens: Set<string>; triggers: string[]; directory: string }> = [];
  for (const skill of maintainedSkills(root)) {
    const directory = skillDirectory(root, skill);
    if (!directory) continue;
    const parsed = parseTemplate(fs.readFileSync(path.join(directory, "SKILL.md.tmpl"), "utf-8"), skill);
    const triggers = Array.isArray(parsed.frontmatter.triggers)
      ? (parsed.frontmatter.triggers as unknown[]).filter((value): value is string => typeof value === "string")
      : [];
    const description = typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : "";
    profiles.push({ skill, directory, triggers, tokens: tokenize(`${description} ${triggers.join(" ")}`) });
  }

  const overlap: OverlapFinding[] = [];
  for (let i = 0; i < profiles.length; i += 1) {
    for (let j = i + 1; j < profiles.length; j += 1) {
      const similarity = Math.round(jaccard(profiles[i]!.tokens, profiles[j]!.tokens) * 1000) / 1000;
      if (similarity < overlapThreshold) continue;
      const shared = profiles[i]!.triggers.filter((trigger) => profiles[j]!.triggers.includes(trigger));
      overlap.push({ a: profiles[i]!.skill, b: profiles[j]!.skill, similarity, sharedTriggers: shared });
    }
  }

  const stale: StalenessFinding[] = [];
  for (const profile of profiles) {
    const touched = lastTouchedAt(root, profile.directory);
    const days = Math.floor((Date.parse(now) - Date.parse(touched)) / 86_400_000);
    if (days >= stalenessThresholdDays) {
      stale.push({ skill: profile.skill, lastTouchedAt: touched, daysSinceTouch: days });
    }
  }

  return {
    schemaVersion: "trove.catalog-advisory.v1",
    generatedAt: now,
    overlapThreshold,
    stalenessThresholdDays,
    overlap: overlap.sort((a, b) => b.similarity - a.similarity),
    stale: stale.sort((a, b) => b.daysSinceTouch - a.daysSinceTouch),
  };
}

export function renderCatalogAdvisory(advisory: CatalogAdvisory): string {
  const lines = [
    "# Catalog advisory",
    "",
    "Advisory only. Nothing here blocks a merge.",
    "",
    `## Overlapping skills (Jaccard ≥ ${advisory.overlapThreshold})`,
    "",
  ];
  if (advisory.overlap.length === 0) lines.push("No skill pair crosses the overlap threshold.");
  else {
    lines.push("| Skill | Skill | Similarity | Shared triggers |", "| --- | --- | ---: | --- |");
    for (const finding of advisory.overlap) {
      lines.push(`| ${finding.a} | ${finding.b} | ${finding.similarity} | ${finding.sharedTriggers.join(", ") || "—"} |`);
    }
  }
  lines.push("", `## Untouched for ${advisory.stalenessThresholdDays}+ days`, "");
  if (advisory.stale.length === 0) lines.push("No skill is past the staleness threshold.");
  else for (const finding of advisory.stale) {
    lines.push(`- \`${finding.skill}\` — last touched ${finding.lastTouchedAt.slice(0, 10)} (${finding.daysSinceTouch} days)`);
  }
  lines.push(
    "",
    "Age alone is not decay: a stable skill can be correct and untouched. Treat",
    "these as a read order, not a work queue.",
  );
  return `${lines.join("\n")}\n`;
}
