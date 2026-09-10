import * as fs from "fs";
import * as path from "path";

export const COPILOT_CONTRACT = {
  minimumTestedCliVersion: "1.0.69",
  pluginManifestSearchOrder: [
    ".plugin/plugin.json",
    "plugin.json",
    ".github/plugin/plugin.json",
    ".claude-plugin/plugin.json",
  ],
  marketplaceManifestSearchOrder: [
    "marketplace.json",
    ".plugin/marketplace.json",
    ".github/plugin/marketplace.json",
    ".claude-plugin/marketplace.json",
  ],
  pluginCommands: ["install", "list", "uninstall", "update"],
} as const;

const PLUGIN_FIELDS = new Set([
  "name", "description", "version", "author", "homepage", "repository",
  "license", "keywords", "category", "tags", "agents", "skills", "commands",
  "hooks", "extensions", "mcpServers", "lspServers",
]);
const COMPONENT_FIELDS = ["agents", "skills", "commands", "hooks", "extensions", "mcpServers", "lspServers"] as const;

export interface CopilotContractFinding {
  field: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeComponentPath(value: string): boolean {
  if (!value.startsWith("./") || path.isAbsolute(value)) return false;
  return !value.split(/[\\/]/).includes("..");
}

export function validateCopilotPluginManifest(
  raw: unknown,
  pluginRoot?: string,
): CopilotContractFinding[] {
  if (!isRecord(raw)) return [{ field: "$", message: "plugin manifest must be an object" }];
  const findings: CopilotContractFinding[] = [];
  const name = raw.name;
  if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    findings.push({ field: "name", message: "must be kebab-case and at most 64 characters" });
  }
  for (const field of Object.keys(raw)) {
    if (!PLUGIN_FIELDS.has(field)) findings.push({ field, message: "is not a documented Copilot plugin field" });
  }
  for (const field of COMPONENT_FIELDS) {
    const value = raw[field];
    if (value === undefined) continue;
    const paths = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (paths.length === 0 || paths.some((entry) => typeof entry !== "string" || !isSafeComponentPath(entry))) {
      findings.push({ field, message: "must contain safe plugin-relative paths beginning with ./" });
      continue;
    }
    if (pluginRoot) {
      for (const componentPath of paths) {
        if (typeof componentPath !== "string") continue;
        if (!fs.existsSync(path.resolve(pluginRoot, componentPath))) {
          findings.push({ field, message: `references missing component path ${componentPath}` });
        }
      }
    }
  }
  return findings;
}

export function firstDiscoveredManifest(
  available: readonly string[],
  order: readonly string[],
): string | undefined {
  const candidates = new Set(available);
  return order.find((entry) => candidates.has(entry));
}
