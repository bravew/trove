#!/usr/bin/env bun

import * as fs from "fs";
import * as path from "path";

interface CatalogPlugin {
  name: string;
  platforms: string[];
  roles?: string[];
}

interface Catalog {
  plugins: CatalogPlugin[];
}

const root = process.env.TROVE_GENERATOR_ROOT ?? path.resolve(import.meta.dir, "..");
const role = process.argv[2] ?? "all";
const host = process.argv[3];
const allowedRoles = new Set(["all", "dev", "design", "pm", "devops"]);

if (!allowedRoles.has(role) || !host) {
  console.error("usage: select-plugins.ts <all|dev|design|pm|devops> <host>");
  process.exit(2);
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf-8")) as Catalog;
for (const plugin of catalog.plugins) {
  if (!plugin.platforms.includes(host)) continue;
  if (role !== "all" && !plugin.roles?.includes(role)) continue;
  console.log(plugin.name);
}
