/**
 * Template placeholder resolver registry.
 *
 * Resolvers expand `{{PLACEHOLDER}}` tokens inside `SKILL.md.tmpl`. A token
 * of the form `{{NAME:arg1:arg2}}` dispatches to the resolver registered
 * under `NAME` with `args = ["arg1","arg2"]`.
 *
 * Available placeholders:
 *
 *   {{PREAMBLE}}    — Skill's `preamble-tier` (default tier 2).
 *   {{PREAMBLE:N}}  — Tier N preamble (1, 2, 3, or 4). Explicit override
 *                     wins over the skill's frontmatter `preamble-tier`.
 *   {{VERSION}}     — Marketplace version from the repo `VERSION` file.
 *
 * Resolvers receive a `ResolverContext` and return a `ResolverResult`. The
 * generator passes the result's `value` field through to the projected
 * output. Future projection modes (sidecar, metadata) flow through the
 * same protocol without touching individual resolvers.
 */

import * as fs from "fs";
import * as path from "path";
import type { ResolverContext, ResolverRegistry, ResolverResult } from "./types";
import { inline } from "./types";

const ROOT = path.resolve(import.meta.dir, "../..");

function loadVersion(): string {
  const vPath = path.join(ROOT, "VERSION");
  if (!fs.existsSync(vPath)) return "0.0.0";
  return fs.readFileSync(vPath, "utf-8").trim() || "0.0.0";
}

function loadPreambleTier(tier: number, marketplaceVersion: string): string {
  const tierPath = path.join(ROOT, "templates", `preamble-tier-${tier}.md`);
  if (fs.existsSync(tierPath)) {
    return fs
      .readFileSync(tierPath, "utf-8")
      .trim()
      .replaceAll("{{VERSION}}", marketplaceVersion);
  }

  // Backwards-compat: legacy single preamble.md is still supported but
  // deprecated. New skills rely on the tier-2 default or `{{PREAMBLE:N}}`.
  const legacyPath = path.join(ROOT, "templates", "preamble.md");
  if (fs.existsSync(legacyPath)) {
    return fs.readFileSync(legacyPath, "utf-8").trim();
  }

  return "## Session Init\n\nThis skill ships Trove conventions.";
}

/**
 * Resolve which preamble tier to render. Precedence:
 *   1. Explicit arg from `{{PREAMBLE:N}}`
 *   2. Skill frontmatter `preamble-tier`
 *   3. Default tier 2
 */
function resolveTier(args?: string[], skillTier?: number): number {
  if (args && args.length > 0) {
    const n = Number(args[0]);
    if (!Number.isInteger(n) || n < 1 || n > 4) {
      throw new Error(
        `{{PREAMBLE:${args[0]}}} — tier must be an integer 1-4 (got "${args[0]}"). See docs/preamble-tiers.md.`,
      );
    }
    return n;
  }
  if (skillTier !== undefined && Number.isInteger(skillTier) && skillTier >= 1 && skillTier <= 4) {
    return skillTier;
  }
  return 2;
}

export const resolvers: ResolverRegistry = {
  PREAMBLE: (ctx: ResolverContext): ResolverResult => {
    const tier = resolveTier(ctx.args, ctx.skill?.v2.preambleTier);
    return inline(loadPreambleTier(tier, ctx.marketplaceVersion));
  },
  VERSION: (ctx: ResolverContext): ResolverResult => inline(ctx.marketplaceVersion),
};

/** Build a base ResolverContext for the current workspace. */
export function makeBaseContext(): Pick<ResolverContext, "marketplaceVersion" | "projectRoot"> {
  return { marketplaceVersion: loadVersion(), projectRoot: ROOT };
}
