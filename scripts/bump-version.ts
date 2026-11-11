#!/usr/bin/env bun
/**
 * Bump the marketplace version (calendar-based, monotonic within a day).
 * Updates VERSION, marketplace.yaml metadata.version, and package.json.
 *
 * `YYYY.M.D` alone is not enough: hosts compare the generated plugin.json
 * version against the installed one and skip an update when they match, so a
 * second merge on the same day would ship new artifacts under an unchanged
 * version and never reach anyone. A trailing counter makes every merge a new
 * version. `checkVersionFile` already accepts the four-part shape.
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dir, "..");

/**
 * The version a release at `date` should carry, given what `current` says.
 * The first release of a day is `YYYY.M.D`; each later one increments the
 * trailing counter.
 */
export function nextVersion(current: string, date: Date): string {
  const base = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
  const parts = current.trim().split(".");
  if (parts.length === 3 && parts.join(".") === base) return `${base}.1`;
  if (parts.length === 4 && parts.slice(0, 3).join(".") === base) {
    const counter = Number(parts[3]);
    return `${base}.${Number.isInteger(counter) && counter > 0 ? counter + 1 : 1}`;
  }
  return base;
}

if (import.meta.main) {
  const current = fs.readFileSync(path.join(ROOT, "VERSION"), "utf-8");
  const version = nextVersion(current, new Date());

  fs.writeFileSync(path.join(ROOT, "VERSION"), version + "\n");

  const yamlPath = path.join(ROOT, "marketplace.yaml");
  const marketplace = YAML.parse(fs.readFileSync(yamlPath, "utf-8"));
  marketplace.metadata.version = version;
  fs.writeFileSync(yamlPath, YAML.stringify(marketplace, { lineWidth: 100 }));

  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  console.log(`✓ Bumped version to ${version}`);
}
