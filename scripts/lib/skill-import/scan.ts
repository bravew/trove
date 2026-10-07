import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";
import { validateAgentSkillFrontmatter } from "../agent-skills-spec";
import { findSecretMatches } from "../secret-scan";
import { validateSkillBudget } from "../skill-budget";
import { loadUpstreamManifest, repositoryPathAt } from "../upstream-manifest";
import { matchesPattern } from "../upstream-sync";
import type { FetchResult, Finding, ProposedTransform, Selection } from "./types";

export interface ScanResult {
  findings: readonly Finding[];
  proposedTransforms: readonly ProposedTransform[];
  license: { file: string; expression: string } | null;
}

export interface ScanOptions {
  /** Repository root holding `external/policy.yaml`, `upstream.yaml`, and `skills/`. */
  root?: string;
  /** Evaluate layout relative to this skill root; report paths remain repository-relative. */
  upstreamPath?: string;
}

interface SelectedFile {
  path: string;
  mode: string;
  bytes: Buffer;
  /** Symlink text, present only for git mode 120000. */
  linkTarget?: string;
}

const GITLINK_MODE = "160000";

/** Bidi controls (U+061C, U+200E-F, U+202A-E, U+2066-9) and zero-width characters. Escaped so this file carries none. */
const TROJAN_SOURCE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;

const LICENSE_NAMES = new Set(["license", "licence", "copying", "license.md", "licence.md", "copying.md"]);

const LICENSE_HEADERS: ReadonlyArray<{ pattern: RegExp; expression: string }> = [
  { pattern: /mit license/i, expression: "MIT" },
  { pattern: /apache license/i, expression: "Apache-2.0" },
  { pattern: /mozilla public license,? version 2\.0/i, expression: "MPL-2.0" },
  { pattern: /isc license/i, expression: "ISC" },
  { pattern: /bsd 2-clause/i, expression: "BSD-2-Clause" },
  { pattern: /bsd 3-clause/i, expression: "BSD-3-Clause" },
  { pattern: /redistribution and use in source and binary forms, with or without/i, expression: "BSD-3-Clause" },
];

const SPDX_LINE = /SPDX-License-Identifier:\s*(\S+)/i;

/** Code patterns that are reported, never decided. Order is the report order. */
const CODE_FLAGS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /\b(?:fetch|axios|requests|httpx|urllib|aiohttp|XMLHttpRequest|WebSocket)\b|\bhttps?\.request\b|\bnet\.(?:Dial|Listen)\b|\burllib\.request\b/, message: "network use" },
  { pattern: /shell\s*=\s*True\b/, message: "subprocess with shell=True" },
  { pattern: /\beval\s*\(|\bexec\s*\(|\bnew\s+Function\s*\(/, message: "eval/exec call" },
  { pattern: /curl\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/, message: "curl piped to a shell" },
  { pattern: /\$HOME|~\/\.(?:bashrc|zshrc|profile|bash_profile)\b|\.(?:bashrc|zshrc|bash_profile)\b/, message: "writes to $HOME or a shell rc file" },
  { pattern: /(?:os\.environ(?:\.get)?|os\.getenv|process\.env|ENV)\s*[\[(.]\s*["']?[A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD)/, message: "reads a token-like environment variable" },
];

const PROSE_FLAGS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /ignore previous/i, message: 'agent-directed prose: "ignore previous"' },
  { pattern: /do not tell the user/i, message: 'agent-directed prose: "do not tell the user"' },
];

const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Sibling directories a self-relative path may be reaching for. */
const SIBLING_DIRS = ["templates", "references", "scripts", "assets", "rules", "prompts", "hooks", "mcp"];

const COUPLING = new RegExp(
  `((?:\\w+\\.)?(?:__file__|parent)[^\n'"]{0,40}['"](?:${SIBLING_DIRS.join("|")})['"]|['"](?:${SIBLING_DIRS.join("|")})['"][^\n'"]{0,40}(?:__file__|\\.parent))`,
);

const SUSPICIOUS_PATHS = [
  { test: (file: string) => file === "AGENTS.md" || file.endsWith("/AGENTS.md"), message: "source contains AGENTS.md" },
  { test: (file: string) => file === "CLAUDE.md" || file.endsWith("/CLAUDE.md"), message: "source contains CLAUDE.md" },
  { test: (file: string) => file === ".claude" || file.startsWith(".claude/"), message: "source contains .claude/" },
  { test: (file: string) => /(^|\/)hooks\//.test(file) || /(^|\/)hooks?\.(json|ya?ml|sh|py|js|mjs|ts)$/.test(file), message: "source contains hooks" },
  { test: (file: string) => /(^|\/)mcp\//.test(file) || /(^|\/)mcp\.(json|ya?ml)$/.test(file), message: "source contains an MCP definition" },
];

const DEFAULT_ROOT = path.resolve(import.meta.dirname, "../../..");

function run(args: readonly string[]): Buffer {
  const result = spawnSync("git", [...args], { encoding: null, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function selected(candidate: string, selection: Selection): boolean {
  const included = selection.include.length === 0 ||
    selection.include.some((pattern) => matchesPattern(candidate, pattern));
  return included && !selection.exclude.some((pattern) => matchesPattern(candidate, pattern));
}

function unsafePath(candidate: string): string | undefined {
  if (candidate.startsWith("/") || /^[A-Za-z]:[\\/]/.test(candidate)) return "absolute path";
  if (candidate.split("/").includes("..")) return "path contains '..'";
  return undefined;
}

function readGitTree(source: FetchResult, selection: Selection): SelectedFile[] {
  const output = run(["--git-dir", source.gitDirectory, "ls-tree", "-r", "-z", source.resolvedSha]);
  const lines = output.toString("utf8").split("\0").filter(Boolean);
  const files: SelectedFile[] = [];
  for (const line of lines) {
    const match = /^(\d{6}) (?:blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);
    if (!match) throw new Error("unexpected git tree entry while scanning source");
    const [, mode, object, filePath] = match;
    if (!selected(filePath, selection)) continue;
    // A submodule's commit is not in this repository, so there is no blob to read.
    if (mode === GITLINK_MODE) {
      files.push({ path: filePath, mode, bytes: Buffer.alloc(0) });
      continue;
    }
    const bytes = run(["--git-dir", source.gitDirectory, "cat-file", "blob", object]);
    files.push({
      path: filePath,
      mode,
      bytes,
      linkTarget: mode === "120000" ? bytes.toString("utf8") : undefined,
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function loadAllowlist(root: string): readonly string[] {
  const policyPath = path.join(root, "external", "policy.yaml");
  const parsed = YAML.parse(fs.readFileSync(policyPath, "utf8")) as { allowedLicenses?: unknown };
  if (!Array.isArray(parsed.allowedLicenses) || parsed.allowedLicenses.some((entry) => typeof entry !== "string")) {
    throw new Error(`${policyPath}: allowedLicenses must be a list of strings`);
  }
  return parsed.allowedLicenses as string[];
}

function isLicenseFile(filePath: string): boolean {
  return LICENSE_NAMES.has(path.posix.basename(filePath).toLowerCase());
}

function licenseExpression(text: string, allowlist: readonly string[]): string | undefined {
  const spdx = SPDX_LINE.exec(text);
  SPDX_LINE.lastIndex = 0;
  if (spdx) return spdx[1].trim();
  const head = text.slice(0, 4000);
  for (const license of allowlist) {
    if (new RegExp(`(?:^|\\s)${license.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(head)) {
      return license;
    }
  }
  return LICENSE_HEADERS.find((header) => header.pattern.test(head))?.expression;
}

function depthOf(filePath: string): number {
  return filePath.split("/").length;
}

/**
 * Proposes the plan's rewrite for `HERE.parent / "templates"`: drop one
 * `.parent`, on the assumption that path_map moves the directory beside the
 * file. Other shapes (`__file__`, `os.path.join`) get no mechanical proposal.
 */
function proposedRewrite(literal: string): string | undefined {
  const match = /^([A-Za-z_]\w*)\.parent(\s*\/\s*['"][^'"]+['"])$/.exec(literal);
  return match && match[1] !== "__file__" ? `${match[1]}${match[2]}` : undefined;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function frontmatterOf(text: string): { data: Record<string, unknown>; body: string } | undefined {
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return undefined;
  let parsed: unknown;
  try {
    parsed = YAML.parse(text.slice(4, end));
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  return { data: parsed as Record<string, unknown>, body: text.slice(end + 5) };
}

function skillName(files: readonly SelectedFile[]): { name?: string; file?: string; frontmatter?: Record<string, unknown>; body?: string } {
  const skill = files.find((file) => file.path === "SKILL.md" || file.path.endsWith("/SKILL.md") || file.path === "SKILL.md.tmpl");
  if (!skill || skill.bytes.includes(0)) return {};
  const parsed = frontmatterOf(skill.bytes.toString("utf8"));
  const name = parsed && typeof parsed.data.name === "string" ? parsed.data.name : undefined;
  return { name, file: skill.path, frontmatter: parsed?.data, body: parsed?.body };
}

function existingSkillNames(root: string): Set<string> {
  const names = new Set<string>();
  const skills = path.join(root, "skills");
  if (!fs.existsSync(skills)) return names;
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name === "SKILL.md.tmpl" || entry.name === "SKILL.md") names.add(path.basename(directory));
    }
  };
  visit(skills);
  return names;
}

function allowedToolsEntries(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return [];
}

function flagLines(text: string, pattern: RegExp): number[] {
  const lines: number[] = [];
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(global)) {
    if (match.index !== undefined) lines.push(lineOf(text, match.index));
  }
  return lines;
}

function supportDirectory(filePath: string): string | undefined {
  const [top] = filePath.split("/");
  if (!top || top === filePath) return undefined;
  if (top === "references" || top === "scripts") return undefined;
  if (isLicenseFile(filePath) || top === "SKILL.md" || top === "SKILL.md.tmpl") return undefined;
  return top;
}

function scanFiles(files: readonly SelectedFile[], root: string, upstreamPath: string): ScanResult {
  const findings: Finding[] = [];
  const proposedTransforms: ProposedTransform[] = [];
  const reject = (file: string, line: number, message: string) => findings.push({ severity: "hard-reject", file, line, message });
  const flag = (file: string, line: number, message: string) => findings.push({ severity: "flag", file, line, message });

  const allowlist = loadAllowlist(root);
  const manifest = loadUpstreamManifest(root);
  const { maximumFileBytes, maximumArtifactBytes } = manifest.policy;

  let total = 0;
  const licenses: Array<{ file: string; expression: string }> = [];
  const reported = new Set<string>();

  for (const file of files) {
    const unsafe = unsafePath(file.path);
    if (unsafe) reject(file.path, 1, unsafe);

    if (file.mode === "120000" || file.linkTarget !== undefined) {
      reject(file.path, 1, `symlink${file.linkTarget ? ` to '${file.linkTarget}'` : ""} is not allowed`);
      continue;
    }

    if (file.mode === GITLINK_MODE) {
      reject(file.path, 1, "submodule is not allowed; its content is not part of this source");
      continue;
    }

    if (file.bytes.length > maximumFileBytes) {
      reject(file.path, 1, `'${file.path}' is ${file.bytes.length} bytes, over maximum_file_bytes ${maximumFileBytes}`);
    }
    total += file.bytes.length;

    if (file.bytes.includes(0)) {
      reject(file.path, 1, `binary file '${file.path}' is not allowed`);
      continue;
    }

    const text = file.bytes.toString("utf8");

    if (isLicenseFile(file.path)) {
      licenses.push({ file: file.path, expression: licenseExpression(text, allowlist) ?? "" });
    }

    for (const name of findSecretMatches(file.path, text)) {
      reject(file.path, 1, `secret hit: ${name}`);
    }

    // A leading byte-order mark is an encoding marker, not hidden text.
    const unmarked = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    for (const line of flagLines(unmarked, TROJAN_SOURCE)) {
      reject(file.path, line, "bidirectional-override or zero-width Unicode (Trojan Source)");
    }

    for (const rule of CODE_FLAGS) {
      for (const line of flagLines(text, rule.pattern)) flag(file.path, line, rule.message);
    }

    for (const rule of PROSE_FLAGS) {
      for (const line of flagLines(text, rule.pattern)) flag(file.path, line, rule.message);
    }

    for (const comment of text.matchAll(HTML_COMMENT)) {
      if (comment.index !== undefined && comment[0].replace(/<!--|-->/g, "").trim().length > 0) {
        flag(file.path, lineOf(text, comment.index), "instructions inside an HTML comment");
      }
    }

    if (text.includes("{{")) {
      flag(file.path, lineOf(text, text.indexOf("{{")), "'{{' would collide with the template resolver");
    }

    const relativePath = upstreamPath !== "." && file.path.startsWith(`${upstreamPath}/`)
      ? file.path.slice(upstreamPath.length + 1)
      : file.path;
    const support = supportDirectory(relativePath);
    if (support && !reported.has(`support:${support}`)) {
      reported.add(`support:${support}`);
      flag(file.path, 1, `support directory '${support}/' is not references/ or scripts/`);
    }

    for (const suspicious of SUSPICIOUS_PATHS) {
      if (suspicious.test(relativePath) && !reported.has(suspicious.message)) {
        reported.add(suspicious.message);
        flag(file.path, 1, suspicious.message);
      }
    }

    for (const line of flagLines(text, COUPLING)) {
      const literal = COUPLING.exec(text.split("\n")[line - 1] ?? "")?.[1];
      if (!literal || proposedTransforms.some((transform) => transform.path === file.path && transform.from === literal)) {
        continue;
      }
      const directory = literal.match(/['"]([^'"]+)['"]/)?.[1] ?? "sibling";
      // references/ and scripts/ keep their place in a Trove skill, so a path between them still resolves.
      if (directory === "references" || directory === "scripts") continue;
      const rewrite = proposedRewrite(literal);
      if (!rewrite) {
        flag(file.path, line, `code resolves '${directory}/' relative to its own location; no mechanical rewrite proposed`);
        continue;
      }
      const mapped = `${path.posix.dirname(relativePath)}/${directory}/`;
      proposedTransforms.push({
        kind: "replace-literal",
        path: file.path,
        from: literal,
        to: rewrite,
        minimumOccurrences: 1,
      });
      flag(file.path, line, `code resolves '${directory}/' relative to its own location; proposed replace-literal assumes path_map '${directory}/: ${mapped}'`);
    }
  }

  if (total > maximumArtifactBytes) {
    reject(files[0]?.path ?? "", 1, `selected files are ${total} bytes, over maximum_artifact_bytes ${maximumArtifactBytes}`);
  }

  // The shallowest license governs the source. A nested one usually belongs to
  // a bundled dependency, so it cannot accept or reject the source on its own,
  // but one outside the allowlist still needs a human to look.
  const [license, ...nested] = [...licenses].sort((a, b) => depthOf(a.file) - depthOf(b.file));
  for (const other of nested) {
    if (!allowlist.includes(other.expression)) {
      flag(other.file, 1, `nested license '${other.expression || "unrecognized"}' is outside the allowlist`);
    }
  }

  if (!license) {
    reject("LICENSE", 1, "no license file in the selection");
  } else if (!allowlist.includes(license.expression)) {
    reject(
      license.file,
      1,
      license.expression
        ? `license '${license.expression}' is outside the allowlist (${allowlist.join(", ")})`
        : "license file has no recognized SPDX expression or license header",
    );
  }

  const skill = skillName(files);
  if (skill.name && skill.file) {
    if (existingSkillNames(root).has(skill.name)) {
      reject(skill.file, 1, `skill name '${skill.name}' collides with an existing Trove skill`);
    }
    if (skill.frontmatter) {
      for (const entry of allowedToolsEntries(skill.frontmatter["allowed-tools"])) {
        if (entry === "Bash" || entry === "*") {
          flag(skill.file, 1, `broad allowed-tools entry '${entry}'`);
        }
      }
      for (const issue of validateAgentSkillFrontmatter(skill.frontmatter).errors) {
        flag(skill.file, 1, `Agent Skills spec: ${issue.field} ${issue.message}`);
      }
      if (skill.body !== undefined) {
        const description = typeof skill.frontmatter.description === "string" ? skill.frontmatter.description : "";
        const whenToUse = typeof skill.frontmatter.when_to_use === "string" ? skill.frontmatter.when_to_use : undefined;
        for (const budget of validateSkillBudget({ description, whenToUse, body: skill.body })) {
          flag(skill.file, 1, `budget overflow: ${budget.message}`);
        }
      }
    }
  }

  return { findings, proposedTransforms, license: license ?? null };
}

export async function scanSource(
  source: FetchResult,
  selection: Selection,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const upstreamPath = repositoryPathAt(options.upstreamPath ?? ".", "scan upstreamPath");
  return scanFiles(readGitTree(source, selection), options.root ?? DEFAULT_ROOT, upstreamPath);
}
