#!/usr/bin/env bun
/**
 * Stage 5: Emit a skill-dependency artifact from `benefits-from` metadata.
 *
 * Reads every skill template's frontmatter, builds a forward map
 * (`benefits-from`) and a reverse map (`benefits-of`), and writes the
 * result to `deps.json`. The CLI's `info` command and any future
 * routing tooling reads from this artifact — no consumer should re-parse
 * skill frontmatter.
 *
 * Cycles in the dependency graph are reported as warnings during
 * generation (validate.ts also flags them via the v2 schema unknown-skill
 * path). The artifact is **advisory** — nothing executes from it.
 *
 * Usage:
 *   bun run build:deps                  # Generate
 *   bun run build:deps -- --dry-run     # Freshness check
 */

import * as fs from "fs";
import * as path from "path";
import { findTemplates, loadAndParseTemplate } from "./lib/skill-parser";
import { detectCycles, buildForwardGraph } from "./lib/dep-graph";

const ROOT = path.resolve(import.meta.dir, "..");
const DRY_RUN = process.argv.includes("--dry-run");

interface DepsArtifact {
  /** Source-of-truth `benefits-from` per skill. Empty array if unset. */
  benefitsFrom: Record<string, string[]>;
  /** Reverse lookup. `benefitsOf[X]` lists skills that declare X in their `benefits-from`. */
  benefitsOf: Record<string, string[]>;
  /** Detected cycles in the directed graph (each cycle is a list of skill names). */
  cycles: string[][];
  /** References to skills that don't exist in the workspace. */
  unknownReferences: Array<{ skill: string; missing: string }>;
}

function build(): DepsArtifact {
  const templates = findTemplates();
  const benefitsFrom: Record<string, string[]> = {};
  const benefitsOf: Record<string, string[]> = {};
  const knownSkills = new Set(templates.map((t) => t.skillName));
  const unknownReferences: Array<{ skill: string; missing: string }> = [];

  for (const t of templates) {
    const parsed = loadAndParseTemplate(t);
    const list = parsed.v2.benefitsFrom ?? [];
    benefitsFrom[t.skillName] = list;
    for (const ref of list) {
      if (!knownSkills.has(ref)) {
        unknownReferences.push({ skill: t.skillName, missing: ref });
      }
      const reverse = benefitsOf[ref] ?? [];
      reverse.push(t.skillName);
      benefitsOf[ref] = reverse;
    }
  }

  // Sort each list for deterministic output. The CLI relies on stable
  // ordering between runs; tests assert it.
  for (const k of Object.keys(benefitsFrom)) benefitsFrom[k] = benefitsFrom[k].sort();
  for (const k of Object.keys(benefitsOf)) benefitsOf[k] = benefitsOf[k].sort();

  const cycles = detectCycles(
    buildForwardGraph(
      Object.entries(benefitsFrom).map(([name, benefitsFromList]) => ({
        name,
        benefitsFrom: benefitsFromList,
      })),
    ),
  );

  return { benefitsFrom, benefitsOf, cycles, unknownReferences };
}

const artifact = build();
const content = JSON.stringify(artifact, null, 2) + "\n";
const outputPath = path.join(ROOT, "deps.json");

if (DRY_RUN) {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf-8") : "";
  if (existing !== content) {
    console.log(`STALE: deps.json`);
    console.error("\nGenerated dependency artifact is stale. Run: bun run build:deps");
    process.exit(1);
  }
  console.log(`FRESH: deps.json`);
} else {
  fs.writeFileSync(outputPath, content);
  const skills = Object.keys(artifact.benefitsFrom).length;
  const edges = Object.values(artifact.benefitsFrom).reduce((sum, list) => sum + list.length, 0);
  console.log(`GENERATED: deps.json (${skills} skills, ${edges} dependency edges)`);
  if (artifact.cycles.length > 0) {
    console.warn(`  ⚠ ${artifact.cycles.length} cycle(s) detected:`);
    for (const c of artifact.cycles) console.warn(`     ${c.join(" → ")}`);
  }
  if (artifact.unknownReferences.length > 0) {
    console.warn(`  ⚠ ${artifact.unknownReferences.length} unknown skill reference(s):`);
    for (const u of artifact.unknownReferences) console.warn(`     ${u.skill} → ${u.missing}`);
  }
}

console.log("\n✓ Dependency generation complete.");
