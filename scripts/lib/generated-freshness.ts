import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

function copyPath(sourceRoot: string, targetRoot: string, relativePath: string): void {
  const source = path.join(sourceRoot, relativePath);
  if (!fs.existsSync(source)) return;
  const target = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, preserveTimestamps: true });
}

function filesUnder(root: string, relativePath: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const start = path.join(root, relativePath);
  if (!fs.existsSync(start)) return files;
  const visit = (current: string): void => {
    const stat = fs.statSync(current);
    if (stat.isFile()) {
      files.set(path.relative(root, current), fs.readFileSync(current));
      return;
    }
    for (const entry of fs.readdirSync(current)) visit(path.join(current, entry));
  };
  visit(start);
  return files;
}

export interface FreshnessOptions {
  root: string;
  scriptPath: string;
  seedPaths: string[];
  managedPaths: string[];
  cleanPaths: string[];
}

export function checkGeneratedFreshness(options: FreshnessOptions): string[] {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-freshness-"));
  try {
    for (const relativePath of options.seedPaths) copyPath(options.root, temporary, relativePath);
    for (const relativePath of options.cleanPaths) {
      fs.rmSync(path.join(temporary, relativePath), { recursive: true, force: true });
    }
    const result = spawnSync(process.execPath, [options.scriptPath], {
      cwd: temporary,
      env: { ...process.env, TROVE_GENERATOR_ROOT: temporary },
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `generator exited ${result.status}`);
    }

    const actual = new Map<string, Buffer>();
    const expected = new Map<string, Buffer>();
    for (const relativePath of options.managedPaths) {
      for (const [file, bytes] of filesUnder(options.root, relativePath)) actual.set(file, bytes);
      for (const [file, bytes] of filesUnder(temporary, relativePath)) expected.set(file, bytes);
    }
    const stale: string[] = [];
    for (const file of new Set([...actual.keys(), ...expected.keys()])) {
      const left = actual.get(file);
      const right = expected.get(file);
      if (!left || !right || !left.equals(right)) stale.push(file);
    }
    return stale.sort();
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
