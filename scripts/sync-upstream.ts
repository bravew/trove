#!/usr/bin/env bun

import * as fs from "node:fs";
import * as path from "node:path";
import { checkOffline, checkOnline, renderMarkdown, stableJson, updateArtifacts } from "./lib/upstream-sync";
import { loadUpstreamManifest, validateManifestInventory } from "./lib/upstream-manifest";

interface Options {
  mode: "check" | "update" | "update-source";
  offline: boolean;
  jsonPath?: string;
  markdownPath?: string;
  target?: string;
}

function usage(message?: string): never {
  if (message) console.error(`error: ${message}\n`);
  console.error("Usage:");
  console.error("  bun run scripts/sync-upstream.ts --check [--offline] [--json <path>] [--markdown <path>]");
  console.error("  bun run scripts/sync-upstream.ts --update <artifact> [--json <path>] [--markdown <path>]");
  console.error("  bun run scripts/sync-upstream.ts --update-source <source> [--json <path>] [--markdown <path>]");
  process.exit(2);
}

function parseArguments(args: readonly string[]): Options {
  let mode: Options["mode"] | undefined;
  let target: string | undefined;
  let offline = false;
  let jsonPath: string | undefined;
  let markdownPath: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--check") {
      if (mode) usage("choose exactly one mode");
      mode = "check";
    }
    else if (argument === "--update" || argument === "--update-source") {
      if (mode) usage("choose exactly one mode");
      mode = argument === "--update" ? "update" : "update-source";
      const value = args[++index];
      if (!value || value.startsWith("--")) usage(`${argument} requires an id`);
      target = value;
    }
    else if (argument === "--offline") offline = true;
    else if (argument === "--json") {
      const value = args[++index];
      if (!value || value.startsWith("--")) usage("--json requires a path");
      jsonPath = value;
    } else if (argument === "--markdown") {
      const value = args[++index];
      if (!value || value.startsWith("--")) usage("--markdown requires a path");
      markdownPath = value;
    } else usage(`unknown argument '${argument}'`);
  }
  if (!mode) usage("a mode is required");
  if (offline && mode !== "check") usage("--offline is only valid with --check");
  return {
    mode,
    offline,
    ...(target ? { target } : {}),
    ...(jsonPath ? { jsonPath } : {}),
    ...(markdownPath ? { markdownPath } : {}),
  };
}

export function main(args: readonly string[], root = path.resolve(import.meta.dir, "..")): void {
  const options = parseArguments(args);
  const manifest = loadUpstreamManifest(root);
  validateManifestInventory(manifest, root);
  const report = options.mode === "check"
    ? (options.offline ? checkOffline(root, manifest) : checkOnline(root, manifest))
    : updateArtifacts(root, manifest, options.mode === "update"
      ? { artifactId: options.target }
      : { sourceId: options.target });
  if (options.jsonPath) {
    const output = path.resolve(process.cwd(), options.jsonPath);
    const parent = path.dirname(output);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(output, stableJson(report));
  }
  if (options.markdownPath) {
    const output = path.resolve(process.cwd(), options.markdownPath);
    const parent = path.dirname(output);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(output, renderMarkdown(report));
  }
  process.stdout.write(renderMarkdown(report));
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`upstream sync failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
