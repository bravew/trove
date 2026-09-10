import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Guards for GitHub Agentic Workflows. Trove has not adopted gh-aw yet; these
 * exist ahead of that decision so the first compiled workflow cannot arrive as
 * a hand-edited `.lock.yml`. A generated file with no source, or one changed
 * without its source, is what makes a compiled pipeline untrustworthy.
 */

export function orphanLockFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".lock.yml"))
    .filter((file) => !fs.existsSync(path.join(directory, file.replace(/\.lock\.yml$/, ".md"))))
    .sort();
}

export function lockFilesChangedWithoutSource(files: readonly string[]): string[] {
  const changed = new Set(files);
  return files
    .filter((file) => file.startsWith(".github/workflows/") && file.endsWith(".lock.yml"))
    .filter((file) => !changed.has(file.replace(/\.lock\.yml$/, ".md")))
    .sort();
}
