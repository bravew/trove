#!/usr/bin/env bun
/**
 * Deterministic catalog advisory: skill overlap and staleness.
 *
 * Advisory by construction — it always exits 0. Required gates stay
 * deterministic and blocking elsewhere; this exists to tell a maintainer
 * where to look, not to fail anyone's pull request.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildCatalogAdvisory, renderCatalogAdvisory } from "./lib/catalog-advisory";

const ROOT = path.resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const advisory = buildCatalogAdvisory(ROOT, {
  now: option("now"),
  overlapThreshold: option("overlap") ? Number(option("overlap")) : undefined,
  stalenessThresholdDays: option("stale-days") ? Number(option("stale-days")) : undefined,
});

const json = option("output");
if (json) fs.writeFileSync(path.resolve(ROOT, json), `${JSON.stringify(advisory, null, 2)}\n`);
const markdown = option("markdown");
if (markdown) fs.writeFileSync(path.resolve(ROOT, markdown), renderCatalogAdvisory(advisory));
if (!json && !markdown) process.stdout.write(renderCatalogAdvisory(advisory));

console.log(`CATALOG_ADVISORY overlap=${advisory.overlap.length} stale=${advisory.stale.length}`);
