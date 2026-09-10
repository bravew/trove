#!/usr/bin/env bun

import * as fs from "fs";
import * as path from "path";

const [rootArg, copilotHomeArg] = process.argv.slice(2);
if (!rootArg || !copilotHomeArg) {
  console.error("usage: verify-copilot-install.ts <repository-root> <copilot-home>");
  process.exit(2);
}

const root = fs.realpathSync(rootArg);
const copilotHome = fs.realpathSync(copilotHomeArg);
const version = fs.readFileSync(path.join(root, "VERSION"), "utf-8").trim();
const marketplace = JSON.parse(fs.readFileSync(path.join(root, ".github", "plugin", "marketplace.json"), "utf-8")) as {
  plugins: Array<{ name: string; source: string }>;
};
const configText = fs.readFileSync(path.join(copilotHome, "config.json"), "utf-8")
  .replace(/^\s*\/\/.*$/gm, "");
const config = JSON.parse(configText) as {
  installedPlugins: Array<{ name: string; marketplace: string; version: string; cache_path: string }>;
};

const expectedNames = marketplace.plugins.map((plugin) => plugin.name).sort();
const installedNames = config.installedPlugins.map((plugin) => plugin.name).sort();
if (JSON.stringify(expectedNames) !== JSON.stringify(installedNames)) {
  throw new Error(`installed inventory mismatch: expected ${expectedNames.join(", ")}; got ${installedNames.join(", ")}`);
}

function filesUnder(directory: string): Map<string, { bytes: Buffer; mode: number }> {
  const files = new Map<string, { bytes: Buffer; mode: number }>();
  const visit = (current: string): void => {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`installed component contains symlink: ${current}`);
    if (stat.isFile()) {
      files.set(path.relative(directory, current), { bytes: fs.readFileSync(current), mode: stat.mode & 0o111 });
      return;
    }
    for (const entry of fs.readdirSync(current)) visit(path.join(current, entry));
  };
  visit(directory);
  return files;
}

function compareComponent(source: string, installed: string): void {
  const expected = filesUnder(source);
  const actual = filesUnder(installed);
  for (const file of new Set([...expected.keys(), ...actual.keys()])) {
    const left = expected.get(file);
    const right = actual.get(file);
    if (!left || !right || left.mode !== right.mode || !left.bytes.equals(right.bytes)) {
      throw new Error(`installed component differs: ${path.relative(root, source)}/${file}`);
    }
  }
}

for (const installed of config.installedPlugins) {
  if (installed.marketplace !== "trove" || installed.version !== version) {
    throw new Error(`${installed.name}: expected trove v${version}, got ${installed.marketplace} v${installed.version}`);
  }
  const cachePath = fs.realpathSync(installed.cache_path);
  const relativeCache = path.relative(copilotHome, cachePath);
  if (relativeCache.startsWith("..") || path.isAbsolute(relativeCache)) {
    throw new Error(`${installed.name}: cache path escaped COPILOT_HOME: ${cachePath}`);
  }
  const sourceRoot = path.join(root, "plugins", installed.name);
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, ".plugin", "plugin.json"), "utf-8")) as Record<string, unknown>;
  for (const field of ["skills", "agents", "commands", "hooks", "extensions", "mcpServers", "lspServers"]) {
    const value = manifest[field];
    const references = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    for (const reference of references) {
      if (typeof reference !== "string") throw new Error(`${installed.name}: ${field} reference is not a string`);
      const relative = reference.replace(/^\.\//, "");
      compareComponent(path.join(sourceRoot, relative), path.join(cachePath, relative));
    }
  }
}

console.log(`✓ Verified ${installedNames.length} installed Copilot plugins at v${version}`);
