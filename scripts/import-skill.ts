#!/usr/bin/env bun
/**
 * `/import-skill` engine: fetch an external skill source, scan it, and (only
 * with an explicit `--stage`) write the Trove-owned draft artifacts.
 *
 * `--inspect` is the default and is read-only apart from the JSON and Markdown
 * reports, confined to `.trove/import/<id>/`. Every file in the source is data:
 * findings are reported, never followed.
 *
 * The fetch layer is injected through `runImportCli`'s second argument so tests
 * run offline against a local git directory. There is no environment override.
 */
import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fetchSource, type FetchRequest } from "./lib/skill-import/fetch";
import { scanSource } from "./lib/skill-import/scan";
import { stageImport } from "./lib/skill-import/stage";
import { isCanonicalArtifactPath, loadUpstreamManifest } from "./lib/upstream-manifest";
import { checkOffline, mapPath, matchesPattern, type SyncReport } from "./lib/upstream-sync";
import type {
  FetchResult,
  Finding,
  ImportMode,
  ProposedTransform,
  Selection,
} from "./lib/skill-import/types";

const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const REF_SAFE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export interface ImportCliReport {
  schema_version: 1;
  command: "inspect" | "stage";
  dry_run: boolean;
  source: { repository: string; requested_ref: string; resolved_sha: string };
  selection: {
    path: string;
    include: readonly string[];
    exclude: readonly string[];
    path_map: Readonly<Record<string, string>>;
    files: number;
    bytes: number;
  };
  license: { expression: string | null; path: string; verdict: "ok" | "review" | "rejected" };
  findings: readonly Finding[];
  proposed_transforms: readonly ProposedTransform[];
  accepted_transforms: readonly ProposedTransform[];
  allowed_tools: unknown;
  staged: null | { local_path: string; notes: readonly string[]; offline_check: SyncReport | null };
  error: string | null;
}

export interface ImportCliDependencies {
  /** Defaults to the real https-only fetch. Tests inject an offline checkout. */
  fetchSource?: (request: FetchRequest) => Promise<FetchResult>;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

interface Options {
  source: string;
  ref: string;
  subtree: string;
  include: string[];
  exclude: string[];
  pathMap: Record<string, string>;
  localOnly: string[];
  id?: string;
  root: string;
  json?: string;
  markdown?: string;
  stage: boolean;
  mode?: ImportMode;
  plugin?: string;
  category?: string;
  sourceId?: string;
  renameSkill?: { from: string; to: string };
  preambleMarker?: string;
  acceptTransforms: string[];
  externalTransforms: ProposedTransform[];
  splitFront: boolean;
  license?: string;
  licensePath: string;
  dryRun: boolean;
  help: boolean;
}

const VALUE_FLAGS = new Set([
  "ref", "path", "id", "root", "json", "markdown", "mode", "plugin", "category",
  "source-id", "rename-skill", "preamble-marker", "license", "license-path", "transforms",
]);
const LIST_FLAGS = new Set(["include", "exclude", "path-map", "accept-transform", "local-only"]);
const BOOL_FLAGS = new Set(["inspect", "stage", "dry-run", "split-front", "help"]);
const STAGE_ONLY = ["mode", "plugin", "category", "source-id", "rename-skill", "preamble-marker", "split-front", "accept-transform", "transforms", "local-only"];
const VENDORED_ONLY = ["rename-skill", "preamble-marker", "path-map", "accept-transform", "split-front", "transforms", "local-only"];

const USAGE = `Usage:
  bun run import:skill --inspect <git-url|local-path> [options]   (default)
  bun run import:skill --stage   <git-url|local-path> --id <name> --plugin <plugin>
                                --category <dir> --mode vendored|adapted [options]

Source:
  <git-url|local-path>       https remote, or a clean local checkout whose HEAD is published

Selection (all paths/patterns are relative to --path):
  --path <subdir>            subtree to import; default '.', the repository root
  --ref <sha|tag|branch>     revision to fetch; default HEAD
  --include <pattern>        repeatable allowlist pattern; default '**'
  --exclude <pattern>        repeatable; only '**' is a wildcard
  --path-map <from>:<to>     repeatable; both file paths or both directory prefixes
  --license-path <path>      repository-root-relative license blob; default LICENSE
                             (also added to the scan selection and excluded from staging)
  --local-only <pattern>     repeatable; staged path kept out of the sync lock (vendored)
  .claude/**, .github/**, hooks/**, mcp/**, AGENTS.md, and CLAUDE.md are always
  excluded; their presence is flagged from git tree metadata only.

Reports (confined to <root>/.trove/import/<id>/):
  --json <path>              JSON report path
  --markdown <path>          Markdown report path
  --root <dir>               repository root to scan/stage into; default this checkout
  --dry-run                  validate and report only; writes nothing at all

Stage only:
  --stage                    write the draft skill directory and upstream.yaml rows
  --mode vendored|adapted    required
  --plugin <trove-plugin>    required
  --category <dir>           required
  --id <name>                required, lowercase kebab-case
  --source-id <id>           default --id
  --license <spdx>           required for adapted; vendored may infer from frontmatter
  --accept-transform <n|all> repeatable; 1-based index into proposed_transforms
  --transforms <file>        JSON array of reviewed transforms, already post-path-map:
                             [{ kind: "replace-literal", path, from, to, minimumOccurrences }]
  --rename-skill <from>:<to>
  --preamble-marker <text>
  --split-front              stage a local_only SKILL.md.tmpl front (vendored)
  --help                     print this text
`;

function assertNonEmpty(value: string, label: string): string {
  if (value.length === 0) throw new CliError(`${label} must not be empty`);
  return value;
}

function assertId(value: string, label: string): string {
  if (!ID_PATTERN.test(value)) throw new CliError(`${label} must be lowercase kebab-case (max 64 characters)`);
  return value;
}

function assertRepositoryPath(value: string, label: string): string {
  if (value === ".") return value;
  if (value.includes("\\") || value.includes("\0")) throw new CliError(`${label} must use POSIX separators`);
  if (path.posix.isAbsolute(value)) throw new CliError(`${label} must be repository-relative`);
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new CliError(`${label} must not contain empty, '.' or '..' segments`);
  }
  if (path.posix.normalize(value) !== value) throw new CliError(`${label} must be normalized`);
  return value;
}

function assertPattern(value: string, label: string): string {
  if (value.includes("\\") || value.includes("\0") || path.posix.isAbsolute(value)) {
    throw new CliError(`${label} must be a repository-relative POSIX pattern`);
  }
  if (value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new CliError(`${label} must not contain empty, '.' or '..' segments`);
  }
  if (/[*?[\]]/.test(value.replace(/\*\*/g, ""))) {
    throw new CliError(`${label} only supports the '**' wildcard`);
  }
  return value;
}

function splitPair(value: string, label: string): [string, string] {
  const index = value.indexOf(":");
  if (index <= 0 || index === value.length - 1) throw new CliError(`${label} must be '<from>:<to>'`);
  return [value.slice(0, index), value.slice(index + 1)];
}

function objectAt(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError(`${where} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

/** Explicit string check: a number or object must not slip through as a non-empty value. */
function stringAt(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) throw new CliError(`${where} must be a non-empty string`);
  return value;
}

const TRANSFORM_KEYS = ["kind", "path", "from", "to", "minimumOccurrences"] as const;

function parseTransformEntry(value: unknown, where: string): ProposedTransform {
  const record = objectAt(value, where);
  for (const key of Object.keys(record)) {
    if (!(TRANSFORM_KEYS as readonly string[]).includes(key)) throw new CliError(`${where}: unknown key '${key}'`);
  }
  for (const key of TRANSFORM_KEYS) {
    if (!(key in record)) throw new CliError(`${where}: missing key '${key}'`);
  }
  if (record.kind !== "replace-literal") throw new CliError(`${where}.kind must be 'replace-literal'`);
  const pathname = assertRepositoryPath(stringAt(record.path, `${where}.path`), `${where}.path`);
  if (!isCanonicalArtifactPath(pathname)) {
    throw new CliError(`${where}.path must be SKILL.md.tmpl or under references/ or scripts/`);
  }
  const from = stringAt(record.from, `${where}.from`);
  const to = stringAt(record.to, `${where}.to`);
  if (typeof record.minimumOccurrences !== "number" || !Number.isSafeInteger(record.minimumOccurrences) || record.minimumOccurrences <= 0) {
    throw new CliError(`${where}.minimumOccurrences must be a positive integer`);
  }
  return { kind: "replace-literal", path: pathname, from, to, minimumOccurrences: record.minimumOccurrences };
}

function loadTransformsFile(file: string): ProposedTransform[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new CliError(`--transforms ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(raw)) throw new CliError(`--transforms ${file} must be a JSON array`);
  return raw.map((entry, index) => parseTransformEntry(entry, `--transforms[${index}]`));
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    source: "",
    ref: "HEAD",
    subtree: ".",
    include: [],
    exclude: [],
    pathMap: {},
    localOnly: [],
    root: path.resolve(import.meta.dir, ".."),
    stage: false,
    acceptTransforms: [],
    externalTransforms: [],
    splitFront: false,
    licensePath: "LICENSE",
    dryRun: false,
    help: false,
  };
  const positionals: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      if (arg.startsWith("-")) throw new CliError(`unknown option '${arg}'`);
      positionals.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);

    if (BOOL_FLAGS.has(name)) {
      if (inline !== undefined) throw new CliError(`--${name} does not take a value`);
      if (seen.has(name)) throw new CliError(`--${name} was given more than once`);
      seen.add(name);
      if (name === "stage") options.stage = true;
      else if (name === "dry-run") options.dryRun = true;
      else if (name === "split-front") options.splitFront = true;
      else if (name === "help") options.help = true;
      // --inspect is the default; recording it catches contradictions with --stage.
      continue;
    }

    if (!VALUE_FLAGS.has(name) && !LIST_FLAGS.has(name)) throw new CliError(`unknown option '--${name}'`);
    const value = inline ?? argv[index + 1];
    if (value === undefined || (inline === undefined && value.startsWith("--"))) {
      throw new CliError(`--${name} requires a value`);
    }
    if (inline === undefined) index += 1;

    if (LIST_FLAGS.has(name)) {
      if (name === "include") options.include.push(assertPattern(value, "--include"));
      else if (name === "exclude") options.exclude.push(assertPattern(value, "--exclude"));
      else if (name === "local-only") options.localOnly.push(assertPattern(value, "--local-only"));
      else if (name === "path-map") {
        const [from, to] = splitPair(value, "--path-map");
        if (from.endsWith("/") !== to.endsWith("/")) {
          throw new CliError("--path-map source and target must both be file paths or both be directory prefixes");
        }
        const key = assertRepositoryPath(from.endsWith("/") ? from.slice(0, -1) : from, "--path-map source");
        const target = assertRepositoryPath(to.endsWith("/") ? to.slice(0, -1) : to, "--path-map target");
        options.pathMap[`${key}${from.endsWith("/") ? "/" : ""}`] = `${target}${to.endsWith("/") ? "/" : ""}`;
      } else if (value !== "all" && !/^[1-9][0-9]*$/.test(value)) {
        throw new CliError("--accept-transform must be 'all' or a 1-based index");
      } else {
        options.acceptTransforms.push(value);
      }
      seen.add(name);
      continue;
    }

    if (seen.has(name)) throw new CliError(`--${name} was given more than once`);
    seen.add(name);
    switch (name) {
      case "ref":
        if (!REF_SAFE.test(value) || value.includes("..") || value.includes("//") || value.startsWith("-")) {
          throw new CliError("--ref must be a safe branch, tag, or full SHA");
        }
        options.ref = value;
        break;
      case "path":
        options.subtree = assertRepositoryPath(value, "--path");
        break;
      case "id":
        options.id = assertId(value, "--id");
        break;
      case "root":
        options.root = path.resolve(value);
        break;
      case "json":
        options.json = assertNonEmpty(value, "--json");
        break;
      case "markdown":
        options.markdown = assertNonEmpty(value, "--markdown");
        break;
      case "mode":
        if (value !== "vendored" && value !== "adapted") throw new CliError("--mode must be 'vendored' or 'adapted'");
        options.mode = value;
        break;
      case "plugin":
        options.plugin = assertId(value, "--plugin");
        break;
      case "category":
        options.category = assertId(value, "--category");
        break;
      case "source-id":
        options.sourceId = assertId(value, "--source-id");
        break;
      case "rename-skill": {
        const [from, to] = splitPair(value, "--rename-skill");
        options.renameSkill = { from: assertId(from, "--rename-skill from"), to: assertId(to, "--rename-skill to") };
        break;
      }
      case "preamble-marker":
        options.preambleMarker = assertNonEmpty(value, "--preamble-marker");
        break;
      case "license":
        options.license = assertNonEmpty(value, "--license");
        break;
      case "license-path":
        options.licensePath = assertRepositoryPath(value, "--license-path");
        break;
      case "transforms":
        options.externalTransforms = loadTransformsFile(assertNonEmpty(value, "--transforms"));
        break;
    }
  }

  if (options.help) return options;
  if (seen.has("stage") && seen.has("inspect")) throw new CliError("--stage and --inspect are mutually exclusive");
  if (positionals.length !== 1) throw new CliError("exactly one source (git URL or local path) is required");
  options.source = positionals[0];

  // Confine report paths before any fetch, so a bad path never reaches the network.
  const reportId = options.id ?? deriveId(options.source);
  for (const requested of [options.json, options.markdown]) {
    if (requested !== undefined) confinedReportPath(options.root, reportId, requested);
  }

  if (options.stage) {
    if (!options.mode) throw new CliError("--stage requires --mode vendored|adapted");
    if (!options.id) throw new CliError("--stage requires --id");
    if (!options.plugin) throw new CliError("--stage requires --plugin");
    if (!options.category) throw new CliError("--stage requires --category");
    if (options.mode === "adapted") {
      if (!options.license) throw new CliError("--mode adapted requires --license (the engine cannot infer it)");
      for (const flag of VENDORED_ONLY) {
        if (seen.has(flag)) throw new CliError(`--${flag} is only valid with --mode vendored`);
      }
    }
  } else {
    for (const flag of STAGE_ONLY) {
      if (seen.has(flag)) throw new CliError(`--${flag} is only valid with --stage`);
    }
  }

  return options;
}

function prefix(patterns: readonly string[], subtree: string): string[] {
  if (subtree === ".") return [...patterns];
  return patterns.map((pattern) => (pattern === "**" ? `${subtree}/**` : `${subtree}/${pattern}`));
}

/** Strips the `--path` root from a repository-relative path. Undefined when outside it. */
function stripPrefix(candidate: string, subtree: string): string | undefined {
  if (subtree === ".") return candidate;
  if (candidate === subtree) return "";
  if (candidate.startsWith(`${subtree}/`)) return candidate.slice(subtree.length + 1);
  return undefined;
}

function selectedIn(candidate: string, selection: Selection): boolean {
  const included = selection.include.length === 0 ||
    selection.include.some((pattern) => matchesPattern(candidate, pattern));
  return included && !selection.exclude.some((pattern) => matchesPattern(candidate, pattern));
}

/** Never selected. Their existence is still reported from tree metadata, never their content. */
const DEFAULT_EXCLUDES = [".claude/**", ".github/**", "hooks/**", "mcp/**", "AGENTS.md", "CLAUDE.md"] as const;

const SUSPICIOUS_ENTRIES: ReadonlyArray<{ test: (relative: string) => boolean; label: string }> = [
  { test: (p) => p === "AGENTS.md" || p.endsWith("/AGENTS.md"), label: "AGENTS.md" },
  { test: (p) => p === "CLAUDE.md" || p.endsWith("/CLAUDE.md"), label: "CLAUDE.md" },
  { test: (p) => p === ".claude" || p.startsWith(".claude/"), label: ".claude/" },
  { test: (p) => p === ".github" || p.startsWith(".github/"), label: ".github/" },
  { test: (p) => /(^|\/)hooks\//.test(p) || /(^|\/)hooks?\.(json|ya?ml|sh|py|js|mjs|ts)$/.test(p), label: "hooks" },
  { test: (p) => /(^|\/)mcp\//.test(p) || /(^|\/)mcp\.(json|ya?ml)$/.test(p), label: "an MCP definition" },
];

/** Flags excluded-but-suspicious entries from `git ls-tree` names only. */
function suspiciousPresence(gitDirectory: string, revision: string, subtree: string): Finding[] {
  const result = spawnSync("git", ["--git-dir", gitDirectory, "ls-tree", "-r", "--name-only", "-z", revision], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new CliError(`cannot read the source tree: ${result.stderr?.toString("utf8").trim()}`);
  const findings: Finding[] = [];
  const reported = new Set<string>();
  for (const fullPath of (result.stdout ?? Buffer.alloc(0)).toString("utf8").split("\0")) {
    if (fullPath.length === 0) continue;
    const relative = stripPrefix(fullPath, subtree);
    if (relative === undefined) continue;
    for (const entry of SUSPICIOUS_ENTRIES) {
      if (!entry.test(relative) || reported.has(entry.label)) continue;
      reported.add(entry.label);
      findings.push({ severity: "flag", file: fullPath, line: 1, message: `source contains ${entry.label} (excluded by default; content not read)` });
    }
  }
  return findings;
}

/** Selected file count and byte total, the same set the scanner reads. */
function measureSelection(gitDirectory: string, revision: string, selection: Selection): { files: number; bytes: number } {
  const result = spawnSync("git", ["--git-dir", gitDirectory, "ls-tree", "-r", "-l", "-z", revision], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) throw new CliError(`cannot read the selected tree: ${result.stderr?.toString("utf8").trim()}`);
  let files = 0;
  let bytes = 0;
  for (const line of (result.stdout ?? Buffer.alloc(0)).toString("utf8").split("\0")) {
    const match = /^(\d{6}) (blob|commit|tree) ([0-9a-f]{40})\s+(\d+|-)\t([\s\S]+)$/.exec(line);
    if (!match) continue;
    const [, , , , size, filePath] = match;
    if (!selectedIn(filePath, selection)) continue;
    files += 1;
    bytes += size === "-" ? 0 : Number(size);
  }
  return { files, bytes };
}

function safeReportDirectory(root: string, id: string, create: boolean): string {
  let current = path.resolve(root);
  for (const segment of [".trove", "import", id]) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) {
      if (!create) return current;
      fs.mkdirSync(current);
      continue;
    }
    if (stat.isSymbolicLink()) throw new CliError(`report path is a symlink: ${current}`);
    if (!stat.isDirectory()) throw new CliError(`report path is not a directory: ${current}`);
  }
  return current;
}

/** Lexically confines a report path to `<root>/.trove/import/<id>/`. */
function confinedReportPath(root: string, id: string, requested: string): string {
  const reportRoot = path.resolve(root, ".trove", "import", id);
  const resolved = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(reportRoot, requested);
  const relative = path.relative(reportRoot, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
    throw new CliError(`report path must stay under .trove/import/${id}/: ${requested}`);
  }
  return resolved;
}

function writeReportFile(root: string, id: string, requested: string, content: string, dryRun: boolean): string | null {
  if (dryRun) return null;
  const target = confinedReportPath(root, id, requested);
  const reportRoot = safeReportDirectory(root, id, true);
  const relative = path.relative(reportRoot, target);
  let parent = reportRoot;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    parent = path.join(parent, segment);
    const stat = fs.lstatSync(parent, { throwIfNoEntry: false });
    if (!stat) fs.mkdirSync(parent);
    else if (stat.isSymbolicLink()) throw new CliError(`report path is a symlink: ${parent}`);
    else if (!stat.isDirectory()) throw new CliError(`report path is not a directory: ${parent}`);
  }
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink()) throw new CliError(`report path is a symlink: ${target}`);
  if (existing && !existing.isFile()) throw new CliError(`report path is not a file: ${target}`);
  // Write through an unpredictable exclusive sibling temp file, then rename it
  // into place. rename replaces the directory entry instead of following a
  // preexisting hardlink, so an outside link keeps its original content.
  const temp = `${target}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  try {
    const fd = fs.openSync(temp, "wx");
    try {
      fs.writeFileSync(fd, content, "utf8");
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, target);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* temp never created or already renamed */ }
    throw error;
  }
  return target;
}

function renderMarkdown(report: ImportCliReport): string {
  const lines: string[] = [];
  lines.push("# import-skill report", "");
  lines.push(`- command: \`${report.command}\`${report.dry_run ? " (dry run)" : ""}`);
  lines.push(`- repository: \`${report.source.repository}\``);
  lines.push(`- requested ref: \`${report.source.requested_ref}\``);
  lines.push(`- resolved sha: \`${report.source.resolved_sha}\``);
  lines.push(`- path: \`${report.selection.path}\``);
  lines.push(`- selection: ${report.selection.files} file(s), ${report.selection.bytes} byte(s)`);
  lines.push(`- include: ${report.selection.include.map((pattern) => `\`${pattern}\``).join(", ") || "(none)"}`);
  lines.push(`- exclude: ${report.selection.exclude.map((pattern) => `\`${pattern}\``).join(", ") || "(none)"}`);
  const mappings = Object.entries(report.selection.path_map).map(([from, to]) => `\`${from}\` → \`${to}\``);
  if (mappings.length > 0) lines.push(`- path_map: ${mappings.join(", ")}`);
  lines.push(`- license: ${report.license.expression ? `\`${report.license.expression}\`` : "unresolved"} (${report.license.path}, ${report.license.verdict})`);
  lines.push("");
  lines.push(`## Findings (${report.findings.length})`, "");
  if (report.findings.length === 0) lines.push("None.", "");
  for (const finding of report.findings) {
    lines.push(`- **${finding.severity}** \`${finding.file}:${finding.line}\` — ${finding.message}`);
  }
  if (report.findings.length > 0) lines.push("");
  lines.push(`## Proposed transforms (${report.proposed_transforms.length})`, "");
  if (report.proposed_transforms.length === 0) lines.push("None.", "");
  report.proposed_transforms.forEach((transform, index) => {
    lines.push(`${index + 1}. \`${transform.path}\`: \`${transform.from}\` → \`${transform.to}\` (min ${transform.minimumOccurrences})`);
  });
  if (report.proposed_transforms.length > 0) lines.push("");
  lines.push(`## Accepted transforms (${report.accepted_transforms.length})`, "");
  if (report.accepted_transforms.length === 0) lines.push("None.", "");
  for (const transform of report.accepted_transforms) {
    lines.push(`- \`${transform.path}\`: \`${transform.from}\` → \`${transform.to}\` (min ${transform.minimumOccurrences})`);
  }
  if (report.accepted_transforms.length > 0) lines.push("");
  lines.push("## Staging", "");
  if (!report.staged) {
    lines.push(report.dry_run ? "Dry run: nothing written." : "Not staged.", "");
  } else {
    lines.push(`- local_path: \`${report.staged.local_path}\``);
    lines.push(`- recorded allowed-tools: ${report.allowed_tools === null ? "none" : JSON.stringify(report.allowed_tools)}`);
    for (const note of report.staged.notes) lines.push(`- ${note}`);
    if (report.staged.offline_check) {
      const conclusions = report.staged.offline_check.artifacts.map((artifact) => `${artifact.artifact}: ${artifact.conclusion}`);
      lines.push(`- offline check: ${conclusions.length > 0 ? conclusions.join(", ") : "no artifact locks"}`);
    }
  }
  if (report.error) lines.push("", `**Error:** ${report.error}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function licenseVerdict(findings: readonly Finding[]): "ok" | "review" | "rejected" {
  const licenseFindings = findings.filter((finding) => /licen[cs]e/i.test(finding.message));
  if (licenseFindings.some((finding) => finding.severity === "hard-reject")) return "rejected";
  if (licenseFindings.length > 0) return "review";
  return "ok";
}

function deriveId(repository: string): string {
  const base = repository.replace(/\.git$/, "").split("/").filter(Boolean).pop() ?? "inspect";
  const safe = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return (/^[a-z]/.test(safe) ? safe : `import-${safe}`).slice(0, 64) || "inspect";
}

interface StageChoices {
  mode: ImportMode;
  id: string;
  plugin: string;
  category: string;
}

/** Narrows the optional stage fields; parseArgs already rejected missing ones. */
function stageChoices(options: Options): StageChoices {
  const { mode, id, plugin, category } = options;
  if (!mode || !id || !plugin || !category) throw new CliError("--stage requires --mode, --id, --plugin, and --category");
  return { mode, id, plugin, category };
}

function transformKey(transform: ProposedTransform): string {
  return `${transform.path}\0${transform.from}\0${transform.to}\0${transform.minimumOccurrences}`;
}

/** Index-selected proposals are path-mapped; reviewed `--transforms` entries are already final paths. */
function resolveAccepted(options: Options, proposed: readonly ProposedTransform[]): ProposedTransform[] {
  const accepted: ProposedTransform[] = [];
  const push = (transform: ProposedTransform) => {
    if (!accepted.some((entry) => transformKey(entry) === transformKey(transform))) accepted.push(transform);
  };
  const indices = new Set<number>();
  for (const value of options.acceptTransforms) {
    if (value === "all") {
      for (let index = 0; index < proposed.length; index += 1) indices.add(index);
      continue;
    }
    const position = Number(value) - 1;
    if (position < 0 || position >= proposed.length) {
      throw new CliError(`--accept-transform ${value} is outside proposed_transforms (1..${proposed.length})`);
    }
    indices.add(position);
  }
  for (const index of [...indices].sort((a, b) => a - b)) {
    const transform = proposed[index];
    if (transform.from.length === 0 || transform.to.length === 0 || transform.minimumOccurrences < 1) {
      throw new CliError(`proposed transform ${index + 1} cannot be recorded: 'from'/'to' must be non-empty and minimum_occurrences at least 1`);
    }
    const stripped = stripPrefix(transform.path, options.subtree);
    if (stripped === undefined || stripped === "") {
      throw new CliError(`proposed transform ${index + 1} is outside --path '${options.subtree}'`);
    }
    const mapped = mapPath(stripped, options.pathMap);
    if (!isCanonicalArtifactPath(mapped)) {
      throw new CliError(`proposed transform ${index + 1} maps to '${mapped}', which is outside SKILL.md.tmpl, references/, or scripts/`);
    }
    push({ ...transform, path: mapped });
  }
  for (const transform of options.externalTransforms) push(transform);
  return accepted;
}

function duplicateGuard(root: string, id: string, sourceId: string, category: string): void {
  const manifest = loadUpstreamManifest(root);
  if (manifest.sources.some((source) => source.id === sourceId)) {
    throw new CliError(`source '${sourceId}' is already declared in upstream.yaml; the engine only appends sources`);
  }
  const localPath = `skills/${category}/${id}`;
  if (manifest.skills.some((skill) => skill.localPath === localPath)) {
    throw new CliError(`'${localPath}' is already declared in upstream.yaml skills`);
  }
}

function stagedLicense(root: string, sourceId: string, dryRun: boolean): string | null {
  if (dryRun) return null;
  const manifest = loadUpstreamManifest(root);
  return manifest.sources.find((source) => source.id === sourceId)?.license.expression ?? null;
}

export async function runImportCli(argv: readonly string[], deps: ImportCliDependencies = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (options.help) {
    out(USAGE);
    return 0;
  }

  const id = options.id ?? deriveId(options.source);
  const fetch = deps.fetchSource ?? fetchSource;
  let source: FetchResult | undefined;
  let report: ImportCliReport | null = null;
  const jsonPath = options.json ?? "report.json";
  const markdownPath = options.markdown ?? "report.md";
  const write = (): void => {
    if (!report) return;
    writeReportFile(options.root, id, jsonPath, `${JSON.stringify(report, null, 2)}\n`, options.dryRun);
    writeReportFile(options.root, id, markdownPath, renderMarkdown(report), options.dryRun);
  };
  /** Report writes must not mask the real error: callers get a message instead of a throw. */
  const tryWrite = (): string | null => {
    try {
      write();
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      err(`cannot write report: ${message}`);
      return message;
    }
  };

  let code = 1;

  outer: try {
    source = await fetch({ repository: options.source, ref: options.ref });

    // The scan is repository-relative; staging is relative to --path. The
    // license is read separately by the engine, so it is always scanned and
    // never part of the staged selection.
    const includePatterns = options.include.length > 0 ? options.include : ["**"];
    const scanSelection: Selection = {
      include: [...new Set([...prefix(includePatterns, options.subtree), options.licensePath])],
      exclude: [...new Set([
        ...prefix(options.exclude, options.subtree).filter((pattern) => pattern !== options.licensePath),
        ...prefix([...DEFAULT_EXCLUDES], options.subtree),
      ])],
      pathMap: {},
    };
    const relativeLicense = stripPrefix(options.licensePath, options.subtree);
    const stageSelection: Selection = {
      include: includePatterns,
      exclude: [...new Set([...options.exclude, ...(relativeLicense ? [relativeLicense] : []), ...DEFAULT_EXCLUDES])],
      pathMap: options.pathMap,
    };
    const scan = await scanSource(source, scanSelection, { root: options.root, upstreamPath: options.subtree });
    const findings = [...scan.findings, ...suspiciousPresence(source.gitDirectory, source.resolvedSha, options.subtree)];
    const measured = measureSelection(source.gitDirectory, source.resolvedSha, scanSelection);
    const acceptedTransforms = options.stage ? resolveAccepted(options, scan.proposedTransforms) : [];

    // The detected license is evidence: a caller may not relabel it, and it
    // wins over any upstream frontmatter the engine could otherwise infer.
    const detectedLicense = scan.license?.expression ?? null;
    if (options.license && detectedLicense && options.license !== detectedLicense) {
      throw new CliError(
        `--license '${options.license}' does not match the detected '${detectedLicense}' in ${scan.license?.file}; the license cannot be relabeled`,
      );
    }

    report = {
      schema_version: 1,
      command: options.stage ? "stage" : "inspect",
      dry_run: options.dryRun,
      source: { repository: source.repository, requested_ref: options.ref, resolved_sha: source.resolvedSha },
      selection: {
        path: options.subtree,
        include: stageSelection.include,
        exclude: stageSelection.exclude,
        path_map: stageSelection.pathMap,
        files: measured.files,
        bytes: measured.bytes,
      },
      license: {
        expression: options.license ?? detectedLicense,
        path: scan.license?.file ?? options.licensePath,
        verdict: licenseVerdict(findings),
      },
      findings,
      proposed_transforms: scan.proposedTransforms,
      accepted_transforms: acceptedTransforms,
      allowed_tools: null,
      staged: null,
      error: null,
    };

    const hardRejects = scan.findings.filter((finding) => finding.severity === "hard-reject");
    out(`${options.stage ? "stage" : "inspect"} ${source.repository}@${source.resolvedSha}`);
    out(`selection: ${measured.files} file(s), ${measured.bytes} byte(s); findings: ${findings.length} (${hardRejects.length} hard reject(s)); proposed transforms: ${scan.proposedTransforms.length}`);
    if (tryWrite() !== null) {
      code = 1;
      break outer;
    }
    if (hardRejects.length > 0) {
      err(`import refused: ${hardRejects.length} hard reject(s); nothing staged`);
      for (const finding of hardRejects) err(`  ${finding.file}:${finding.line} ${finding.message}`);
      code = 1;
      break outer;
    }
    if (!options.stage) {
      out(options.dryRun
        ? "inspect clean; dry run wrote nothing"
        : `inspect clean; reports under ${path.join(options.root, ".trove", "import", id)}`);
      code = 0;
      break outer;
    }

    const choices = stageChoices(options);
    duplicateGuard(options.root, choices.id, options.sourceId ?? choices.id, choices.category);

    try {
      const staged = await stageImport({
        mode: choices.mode,
        id: choices.id,
        plugin: choices.plugin,
        category: choices.category,
        selection: stageSelection,
        report: { mode: choices.mode, source, findings: scan.findings, proposedTransforms: scan.proposedTransforms },
        dryRun: options.dryRun,
        root: options.root,
        upstreamPath: options.subtree,
        sourceId: options.sourceId ?? choices.id,
        ref: source.resolvedSha,
        renameSkill: options.renameSkill,
        preambleMarker: options.preambleMarker,
        acceptedTransforms,
        localOnly: options.localOnly,
        licenseExpression: options.license ?? detectedLicense ?? undefined,
        licensePath: options.licensePath,
        splitFront: options.splitFront,
      });
      report.allowed_tools = staged.allowedTools;
      const localPath = `skills/${choices.category}/${choices.id}`;
      // Record the staged outcome the moment stageImport returns: a later
      // offline-check failure must not rewrite history as "Not staged".
      report.staged = {
        local_path: localPath,
        notes: options.dryRun
          ? ["dry run: no files or manifest rows were written"]
          : ["staged; offline verification pending"],
        offline_check: null,
      };
      let offline: SyncReport | null = null;
      if (!options.dryRun) {
        offline = checkOffline(options.root, loadUpstreamManifest(options.root));
        if (choices.mode === "vendored") {
          const conclusion = offline.artifacts.find((artifact) => artifact.artifact === choices.id);
          if (!conclusion || conclusion.conclusion !== "no-changes") {
            throw new CliError(`offline check did not verify the staged lock: ${conclusion?.conclusion ?? "artifact missing"}`);
          }
        }
        report.staged = {
          local_path: localPath,
          notes: choices.mode === "vendored"
            ? ["offline check verified the staged base/local tree digests"]
            : ["adapted import: author SKILL.md.tmpl next; the offline check has no artifact lock to verify"],
          offline_check: offline,
        };
      }
      const expression = options.license ?? detectedLicense ?? stagedLicense(options.root, options.sourceId ?? choices.id, options.dryRun);
      if (expression) report.license.expression = expression;
      if (tryWrite() !== null) {
        code = 1;
        break outer;
      }
      out(options.dryRun ? "dry run complete; nothing written" : `staged ${localPath}`);
      code = 0;
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
      tryWrite();
      err(`stage failed: ${report.error}`);
      code = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (report) {
      report.error = message;
      tryWrite();
    }
    err(message);
    code = 1;
  }

  if (source) {
    try {
      await source.cleanup();
    } catch (error) {
      err(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      code = 1;
    }
  }
  return code;
}

if (import.meta.main) {
  runImportCli(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
