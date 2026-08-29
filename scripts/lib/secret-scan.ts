/**
 * Secret-pattern matching used by `scripts/validate.ts`.
 *
 * Markdown is scanned after code-fence and inline-code stripping so
 * documented example tokens do not trip the gate. Skill `scripts/**`
 * `.py` / `.js` / `.mjs` files are scanned raw.
 */

import * as path from "node:path";

export const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub Token", pattern: /gh[ps]_[A-Za-z0-9_]{36,}/ },
  { name: "Slack Token", pattern: /xox[baprs]-[0-9a-zA-Z-]+/ },
  { name: "Private Key", pattern: /-----BEGIN.*PRIVATE KEY-----/ },
  { name: "Generic Password", pattern: /password\s*[:=]\s*["'][^"']{8,}["']/i },
];

const RAW_SCRIPT_EXTENSIONS = new Set([".py", ".js", ".mjs"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export function shouldStripMarkdownFences(filePath: string): boolean {
  if (filePath.endsWith(".md.tmpl")) return true;
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function shouldScanSkillScript(filePath: string): boolean {
  if (filePath.endsWith(".md.tmpl")) return true;
  const ext = path.extname(filePath).toLowerCase();
  return MARKDOWN_EXTENSIONS.has(ext) || RAW_SCRIPT_EXTENSIONS.has(ext);
}

export function secretScanSubject(filePath: string, content: string): string {
  if (!shouldStripMarkdownFences(filePath)) return content;
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "");
}

export function findSecretMatches(filePath: string, content: string): string[] {
  const subject = secretScanSubject(filePath, content);
  const hits: string[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(subject)) hits.push(name);
  }
  return hits;
}
