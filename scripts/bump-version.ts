#!/usr/bin/env bun
/**
 * Bump the marketplace version (calendar-based).
 * Updates VERSION file and marketplace.yaml metadata.version.
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dir, "..");

const now = new Date();
const version = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;

// Update VERSION file
fs.writeFileSync(path.join(ROOT, "VERSION"), version + "\n");

// Update marketplace.yaml
const yamlPath = path.join(ROOT, "marketplace.yaml");
const content = fs.readFileSync(yamlPath, "utf-8");
const marketplace = YAML.parse(content);
marketplace.metadata.version = version;
fs.writeFileSync(yamlPath, YAML.stringify(marketplace, { lineWidth: 100 }));

// Update package.json
const pkgPath = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`✓ Bumped version to ${version}`);
