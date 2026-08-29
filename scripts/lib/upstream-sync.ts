import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import {
  effectivePolicy,
  isCanonicalArtifactPath,
  type FullSha,
  type Sha256Digest,
  type UpstreamArtifact,
  type UpstreamManifest,
  type UpstreamPolicy,
  type UpstreamSource,
} from "./upstream-manifest";
import { isUnownedSupportName } from "./support-files";

export { isCanonicalArtifactPath };

export interface TreeEntry {
  path: string;
  mode: "100644" | "100755";
  bytes: Buffer;
}

export type SyncConclusion =
  | "no-changes"
  | "update-available"
  | "updated"
  | "conflict"
  | "license-changed"
  | "validation-failed";

export interface ArtifactReport {
  artifact: string;
  source: string;
  old_sha: FullSha | null;
  checked_sha: FullSha;
  candidate_sha: FullSha | null;
  conclusion: SyncConclusion;
  changed_paths: readonly string[];
  license: { expected: string; actual: string | null; status: "unchanged" | "changed" | "missing" };
  patch: {
    digest: "verified" | "not-checked";
    base: "applied" | "blocked" | "not-checked";
    candidate: "applied" | "conflict" | "not-checked";
  };
  verification: readonly string[];
}

export interface SyncReport {
  schema_version: 1;
  mode: "offline" | "check" | "update";
  artifacts: readonly ArtifactReport[];
}

export interface UpdateOptions {
  verify?: (root: string) => readonly string[];
}

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncError";
  }
}

function run(command: string, args: readonly string[], cwd?: string): Buffer {
  const result = spawnSync(command, [...args], { cwd, encoding: null, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8").trim();
    throw new SyncError(`${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return result.stdout ?? Buffer.alloc(0);
}

function runText(command: string, args: readonly string[], cwd?: string): string {
  return run(command, args, cwd).toString("utf8").trim();
}

export function lockEntries(entries: readonly TreeEntry[], artifact: UpstreamArtifact): TreeEntry[] {
  if (artifact.localOnly.length === 0) return [...entries];
  return entries.filter((entry) =>
    !artifact.localOnly.some((pattern) => matchesPattern(entry.path, pattern)));
}

function matchesPattern(candidate: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return candidate === prefix || candidate.startsWith(`${prefix}/`);
  }
  return candidate === pattern;
}

function selected(candidate: string, artifact: UpstreamArtifact): boolean {
  return artifact.include.some((pattern) => matchesPattern(candidate, pattern)) &&
    !artifact.exclude.some((pattern) => matchesPattern(candidate, pattern));
}

function isGenerated(pathname: string, bytes: Buffer): boolean {
  if (/\.(?:min\.(?:js|css)|map)$/i.test(pathname)) return true;
  const head = bytes.subarray(0, Math.min(bytes.length, 512)).toString("utf8");
  return /(?:@generated|generated file|do not edit)/i.test(head);
}

function validateEntries(
  entries: readonly TreeEntry[],
  policy: UpstreamPolicy,
  label: string,
): void {
  let total = 0;
  const paths = new Set<string>();
  for (const entry of entries) {
    if (paths.has(entry.path)) throw new SyncError(`${label}: duplicate path '${entry.path}'`);
    paths.add(entry.path);
    if (entry.bytes.length > policy.maximumFileBytes) {
      throw new SyncError(`${label}: '${entry.path}' exceeds maximum_file_bytes`);
    }
    total += entry.bytes.length;
    if (!policy.allowBinary && entry.bytes.includes(0)) {
      throw new SyncError(`${label}: binary file '${entry.path}' is not allowed`);
    }
    if (!policy.allowGenerated && isGenerated(entry.path, entry.bytes)) {
      throw new SyncError(`${label}: generated file '${entry.path}' is not allowed`);
    }
  }
  if (total > policy.maximumArtifactBytes) {
    throw new SyncError(`${label}: selected files exceed maximum_artifact_bytes`);
  }
}

export function digestTree(entries: readonly TreeEntry[]): Sha256Digest {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.mode);
    hash.update("\0");
    hash.update(String(entry.bytes.length));
    hash.update("\0");
    hash.update(entry.bytes);
  }
  return `sha256:${hash.digest("hex")}` as Sha256Digest;
}

function parseGitTreeLine(line: string, root: string): { mode: string; object: string; path: string } {
  const match = /^(\d{6}) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
  if (!match) throw new SyncError(`unexpected git tree entry: ${JSON.stringify(line)}`);
  const relative = match[3].slice(root.length + 1);
  if (match[1] === "120000") throw new SyncError(`symlink '${relative}' is not allowed`);
  if (match[1] !== "100644" && match[1] !== "100755") {
    throw new SyncError(`unexpected file mode '${match[1]}' for '${relative}'`);
  }
  return { mode: match[1], object: match[2], path: relative };
}

export function readGitSelection(
  gitDirectory: string,
  revision: FullSha,
  artifact: UpstreamArtifact,
  manifest: UpstreamManifest,
): readonly TreeEntry[] {
  const root = artifact.upstreamPath;
  const output = run("git", ["--git-dir", gitDirectory, "ls-tree", "-r", "-z", revision, root]);
  const lines = output.toString("utf8").split("\0").filter(Boolean);
  const entries = lines
    .map((line) => parseGitTreeLine(line, root))
    .filter((entry) => selected(entry.path, artifact))
    .map((entry) => ({
      path: entry.path,
      mode: entry.mode as TreeEntry["mode"],
      bytes: run("git", ["--git-dir", gitDirectory, "cat-file", "blob", entry.object]),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (entries.length === 0) throw new SyncError(`${artifact.id}: include rules selected no files`);
  validateEntries(entries, effectivePolicy(manifest, artifact), `${artifact.id}@${revision}`);
  return entries;
}

function mapPath(candidate: string, mappings: Readonly<Record<string, string>>): string {
  if (mappings[candidate]) return mappings[candidate];
  const prefix = Object.keys(mappings)
    .filter((key) => key.endsWith("/") && candidate.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? `${mappings[prefix]}${candidate.slice(prefix.length)}` : candidate;
}

function injectPreamble(bytes: Buffer, marker: string, artifact: string): Buffer {
  const content = bytes.toString("utf8");
  if (!content.startsWith("---\n")) throw new SyncError(`${artifact}: SKILL.md has no frontmatter`);
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) throw new SyncError(`${artifact}: SKILL.md frontmatter is not closed`);
  const insertion = end + 5;
  return Buffer.from(`${content.slice(0, insertion)}\n${marker}\n${content.slice(insertion)}`, "utf8");
}

function applyTransform(
  transformed: TreeEntry[],
  transform: UpstreamArtifact["transforms"][number],
  artifactId: string,
): void {
  if (transform.kind === "rename-skill") {
    for (const entry of transformed) {
      if (entry.path !== "SKILL.md.tmpl") continue;
      const content = entry.bytes.toString("utf8");
      if (!content.includes(transform.from)) {
        throw new SyncError(`${artifactId}: rename source '${transform.from}' was not found`);
      }
      entry.bytes = Buffer.from(content.split(transform.from).join(transform.to), "utf8");
    }
    return;
  }
  if (transform.kind === "inject-preamble") {
    const skill = transformed.find((entry) => entry.path === "SKILL.md.tmpl");
    if (!skill) throw new SyncError(`${artifactId}: inject-preamble requires mapped SKILL.md.tmpl`);
    skill.bytes = injectPreamble(skill.bytes, transform.marker, artifactId);
    return;
  }
  if (transform.kind === "replace-literal") {
    if (!isCanonicalArtifactPath(transform.path)) {
      throw new SyncError(`${artifactId}: replace-literal path '${transform.path}' is outside canonical template content`);
    }
    const target = transformed.find((entry) => entry.path === transform.path);
    if (!target) {
      throw new SyncError(`${artifactId}: replace-literal path '${transform.path}' was not found`);
    }
    const content = target.bytes.toString("utf8");
    const occurrences = content.split(transform.from).length - 1;
    if (occurrences < transform.minimumOccurrences) {
      throw new SyncError(
        `${artifactId}: replace-literal '${transform.from}' found ${occurrences} time(s) in '${transform.path}', expected at least ${transform.minimumOccurrences}`,
      );
    }
    target.bytes = Buffer.from(content.split(transform.from).join(transform.to), "utf8");
    return;
  }
  const exhaustive: never = transform;
  throw new SyncError(`${artifactId}: unsupported transform '${String(exhaustive)}'`);
}

export function transformSelection(
  entries: readonly TreeEntry[],
  artifact: UpstreamArtifact,
): readonly TreeEntry[] {
  const transformed = entries.map((entry) => ({ ...entry, path: mapPath(entry.path, artifact.pathMap) }));
  for (const transform of artifact.transforms) {
    applyTransform(transformed, transform, artifact.id);
  }
  const paths = transformed.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) throw new SyncError(`${artifact.id}: path_map creates duplicate paths`);
  for (const candidate of paths) {
    if (!isCanonicalArtifactPath(candidate)) {
      throw new SyncError(`${artifact.id}: transformed path '${candidate}' is outside canonical template content`);
    }
  }
  return transformed.sort((a, b) => a.path.localeCompare(b.path));
}

export function walkLocal(directory: string, prefix = ""): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (isUnownedSupportName(item.name)) continue;
    const absolute = path.join(directory, item.name);
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new SyncError(`local artifact contains symlink '${relative}'`);
    if (stat.isDirectory()) entries.push(...walkLocal(absolute, relative));
    else if (stat.isFile() && relative !== "SKILL.md") {
      if (!isCanonicalArtifactPath(relative)) {
        throw new SyncError(`local artifact path '${relative}' is outside canonical template content`);
      }
      entries.push({ path: relative, mode: stat.mode & 0o111 ? "100755" : "100644", bytes: fs.readFileSync(absolute) });
    } else if (!stat.isFile()) {
      throw new SyncError(`local artifact contains unexpected file type '${relative}'`);
    }
  }
  return entries;
}

function safeAbsolute(root: string, repositoryPath: string): string {
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, repositoryPath);
  if (!absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new SyncError(`path escapes repository: '${repositoryPath}'`);
  }
  return absolute;
}

export function patchEntries(root: string, artifact: UpstreamArtifact): TreeEntry[] {
  return artifact.patches.map((patchPath) => {
    const absolute = safeAbsolute(root, patchPath);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new SyncError(`${patchPath}: patch must be a regular file`);
    const bytes = fs.readFileSync(absolute);
    const content = bytes.toString("utf8");
    if (content.includes("GIT binary patch") || content.includes("Binary files ")) {
      throw new SyncError(`${patchPath}: binary patches are not allowed`);
    }
    for (const line of content.split("\n")) {
      const diffHeader = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (diffHeader) {
        for (const candidate of diffHeader.slice(1)) {
          if (path.posix.isAbsolute(candidate) || candidate.split("/").some((part) => part === ".." || part === "")) {
            throw new SyncError(`${patchPath}: unsafe patch path '${candidate}'`);
          }
          if (!isCanonicalArtifactPath(candidate)) {
            throw new SyncError(`${patchPath}: patch path '${candidate}' is outside canonical template content`);
          }
        }
      }
      const match = /^(?:---|\+\+\+) (?:[ab]\/)?(.+)$/.exec(line);
      if (!match || match[1] === "/dev/null") continue;
      const candidate = match[1];
      if (path.posix.isAbsolute(candidate) || candidate.split("/").some((part) => part === ".." || part === "")) {
        throw new SyncError(`${patchPath}: unsafe patch path '${candidate}'`);
      }
      if (!isCanonicalArtifactPath(candidate)) {
        throw new SyncError(`${patchPath}: patch path '${candidate}' is outside canonical template content`);
      }
    }
    return { path: patchPath, mode: stat.mode & 0o111 ? "100755" : "100644", bytes };
  });
}

export function writeEntries(directory: string, entries: readonly TreeEntry[]): void {
  for (const entry of entries) {
    const absolute = safeAbsolute(directory, entry.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, entry.bytes, { mode: entry.mode === "100755" ? 0o755 : 0o644 });
  }
}

function applyPatches(directory: string, root: string, artifact: UpstreamArtifact): void {
  for (const patchPath of artifact.patches) {
    const absolute = safeAbsolute(root, patchPath);
    run("git", ["apply", "--check", absolute], directory);
    run("git", ["apply", absolute], directory);
  }
}

function replayPatches(
  root: string,
  artifact: UpstreamArtifact,
  entries: readonly TreeEntry[],
): readonly TreeEntry[] {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-replay-"));
  try {
    writeEntries(temporary, transformSelection(entries, artifact));
    applyPatches(temporary, root, artifact);
    return walkLocal(temporary);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function changedPaths(before: readonly TreeEntry[], after: readonly TreeEntry[]): readonly string[] {
  const oldEntries = new Map(before.map((entry) => [entry.path, entry]));
  const newEntries = new Map(after.map((entry) => [entry.path, entry]));
  return [...new Set([...oldEntries.keys(), ...newEntries.keys()])]
    .filter((pathname) => {
      const oldEntry = oldEntries.get(pathname);
      const newEntry = newEntries.get(pathname);
      return !oldEntry || !newEntry || oldEntry.mode !== newEntry.mode || !oldEntry.bytes.equals(newEntry.bytes);
    })
    .sort();
}

function licenseExpression(entries: readonly TreeEntry[]): string | null {
  const skill = entries.find((entry) => entry.path === "SKILL.md");
  if (!skill) return null;
  const content = skill.bytes.toString("utf8");
  if (!content.startsWith("---\n")) return null;
  // Match the closing delimiter exactly, as injectPreamble does: a body line
  // like `----` or `--- note` would otherwise truncate the frontmatter and
  // feed a fragment to YAML.parse.
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return null;
  let parsed: unknown;
  try {
    parsed = YAML.parse(content.slice(4, end)) as unknown;
  } catch {
    // Unparseable frontmatter carries no license we can trust; the caller
    // reports that as `missing` rather than crashing the scheduled check.
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = (parsed as Record<string, unknown>).license;
  return typeof value === "string" ? value : null;
}

function verifyLocalLock(
  root: string,
  manifest: UpstreamManifest,
  source: UpstreamSource,
  artifact: UpstreamArtifact,
): ArtifactReport {
  if (artifact.status !== "active") {
    return {
      artifact: artifact.id,
      source: source.id,
      old_sha: null,
      checked_sha: artifact.checkedSha,
      candidate_sha: null,
      conclusion: "validation-failed",
      changed_paths: [],
      license: { expected: source.license.expression, actual: null, status: "missing" },
      patch: { digest: "not-checked", base: "blocked", candidate: "not-checked" },
      verification: ["manifest", "blocked-unproven-base"],
    };
  }
  const localDirectory = safeAbsolute(root, artifact.localPath);
  const walked = walkLocal(localDirectory);
  validateEntries(walked, effectivePolicy(manifest, artifact), artifact.localPath);
  const local = lockEntries(walked, artifact);
  if (digestTree(local) !== artifact.localTreeDigest) {
    throw new SyncError(`${artifact.id}: local tree digest does not match manifest`);
  }
  const patches = patchEntries(root, artifact);
  if (digestTree(patches) !== artifact.patchDigest) {
    throw new SyncError(`${artifact.id}: patch digest does not match manifest`);
  }
  return {
    artifact: artifact.id,
    source: source.id,
    old_sha: artifact.baseSha,
    checked_sha: artifact.checkedSha,
    candidate_sha: null,
    conclusion: artifact.baseSha === artifact.checkedSha ? "no-changes" : "update-available",
    changed_paths: [],
    license: { expected: source.license.expression, actual: source.license.expression, status: "unchanged" },
    patch: { digest: "verified", base: "not-checked", candidate: "not-checked" },
    verification: ["manifest", "inventory", "local-tree-digest", "patch-digest", "path-safety", "file-limits"],
  };
}

export function checkOffline(root: string, manifest: UpstreamManifest): SyncReport {
  return {
    schema_version: 1,
    mode: "offline",
    artifacts: manifest.sources.flatMap((source) =>
      source.artifacts.map((artifact) => verifyLocalLock(root, manifest, source, artifact))),
  };
}

function prepareRemote(source: UpstreamSource, artifact: UpstreamArtifact): { gitDirectory: string; candidate: FullSha; cleanup: () => void } {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-upstream-check-"));
  const gitDirectory = path.join(temporary, "repo.git");
  try {
    run("git", ["init", "--bare", "--quiet", gitDirectory]);
    run("git", ["--git-dir", gitDirectory, "remote", "add", "origin", source.repository]);
    run("git", ["--git-dir", gitDirectory, "fetch", "--quiet", "--no-tags", "--depth=1", "origin", source.ref]);
    const candidate = run("git", ["--git-dir", gitDirectory, "rev-parse", "FETCH_HEAD^{commit}"])
      .toString("utf8").trim() as FullSha;
    if (!/^[0-9a-f]{40}$/.test(candidate)) throw new SyncError(`${source.id}: ref did not resolve to a full SHA`);
    if (artifact.status === "active" && artifact.baseSha !== candidate) {
      run("git", ["--git-dir", gitDirectory, "fetch", "--quiet", "--no-tags", "--depth=1", "origin", artifact.baseSha]);
    }
    return { gitDirectory, candidate, cleanup: () => fs.rmSync(temporary, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function checkOnlineArtifact(
  root: string,
  manifest: UpstreamManifest,
  source: UpstreamSource,
  artifact: UpstreamArtifact,
): ArtifactReport {
  const offline = verifyLocalLock(root, manifest, source, artifact);
  if (artifact.status !== "active") return offline;
  const remote = prepareRemote(source, artifact);
  try {
    const base = readGitSelection(remote.gitDirectory, artifact.baseSha, artifact, manifest);
    if (digestTree(base) !== artifact.baseTreeDigest) {
      throw new SyncError(`${artifact.id}: base tree digest does not match manifest`);
    }
    const actualLicense = licenseExpression(base);
    if (actualLicense !== source.license.expression) {
      return {
        ...offline,
        candidate_sha: remote.candidate,
        conclusion: "license-changed",
        license: {
          expected: source.license.expression,
          actual: actualLicense,
          status: actualLicense === null ? "missing" : "changed",
        },
      };
    }

    const reconstructed = lockEntries(replayPatches(root, artifact, base), artifact);
    const local = lockEntries(walkLocal(safeAbsolute(root, artifact.localPath)), artifact);
    const mismatch = changedPaths(reconstructed, local);
    if (mismatch.length) {
      throw new SyncError(`${artifact.id}: reconstructed base differs from local tree: ${mismatch.join(", ")}`);
    }

    let candidate: readonly TreeEntry[];
    try {
      candidate = readGitSelection(remote.gitDirectory, remote.candidate, artifact, manifest);
    } catch (error) {
      return {
        ...offline,
        candidate_sha: remote.candidate,
        conclusion: "validation-failed",
        patch: { ...offline.patch, base: "applied" },
        verification: [...offline.verification, `candidate-validation:${(error as Error).message}`],
      };
    }
    const candidateLicense = licenseExpression(candidate);
    if (candidateLicense !== source.license.expression) {
      return {
        ...offline,
        candidate_sha: remote.candidate,
        conclusion: "license-changed",
        changed_paths: changedPaths(base, candidate),
        license: {
          expected: source.license.expression,
          actual: candidateLicense,
          status: candidateLicense === null ? "missing" : "changed",
        },
        patch: { ...offline.patch, base: "applied" },
      };
    }
    const differences = changedPaths(base, candidate);
    return {
      ...offline,
      candidate_sha: remote.candidate,
      conclusion: differences.length === 0 ? "no-changes" : "update-available",
      changed_paths: differences,
      license: { expected: source.license.expression, actual: candidateLicense, status: "unchanged" },
      patch: { ...offline.patch, base: "applied" },
      verification: [...offline.verification, "base-tree-digest", "reconstruction", "candidate-selection", "license"],
    };
  } finally {
    remote.cleanup();
  }
}

export function checkOnline(root: string, manifest: UpstreamManifest): SyncReport {
  return {
    schema_version: 1,
    mode: "check",
    artifacts: manifest.sources.flatMap((source) =>
      source.artifacts.map((artifact) => checkOnlineArtifact(root, manifest, source, artifact))),
  };
}

interface CandidateResult {
  report: ArtifactReport;
  selected?: readonly TreeEntry[];
  patched?: readonly TreeEntry[];
  candidateDate?: string;
}

function commitTimestamp(gitDirectory: string, revision: FullSha): string {
  const raw = runText("git", ["--git-dir", gitDirectory, "show", "-s", "--format=%cI", revision]);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new SyncError(`invalid commit timestamp '${raw}'`);
  return parsed.toISOString().replace(".000Z", "Z");
}

function candidateResult(
  root: string,
  manifest: UpstreamManifest,
  source: UpstreamSource,
  artifact: UpstreamArtifact,
): CandidateResult {
  const offline = verifyLocalLock(root, manifest, source, artifact);
  if (artifact.status !== "active") return { report: offline };
  const remote = prepareRemote(source, artifact);
  try {
    const base = readGitSelection(remote.gitDirectory, artifact.baseSha, artifact, manifest);
    if (digestTree(base) !== artifact.baseTreeDigest) {
      throw new SyncError(`${artifact.id}: base tree digest does not match manifest`);
    }
    const reconstructed = lockEntries(replayPatches(root, artifact, base), artifact);
    const local = lockEntries(walkLocal(safeAbsolute(root, artifact.localPath)), artifact);
    const reconstructionMismatch = changedPaths(reconstructed, local);
    if (reconstructionMismatch.length > 0) {
      throw new SyncError(
        `${artifact.id}: reconstructed base differs from local tree: ${reconstructionMismatch.join(", ")}`,
      );
    }
    let candidate: readonly TreeEntry[];
    try {
      candidate = readGitSelection(remote.gitDirectory, remote.candidate, artifact, manifest);
    } catch (error) {
      return {
        report: {
          ...offline,
          candidate_sha: remote.candidate,
          conclusion: "validation-failed",
          patch: { ...offline.patch, base: "applied" },
          verification: [...offline.verification, `candidate-validation:${(error as Error).message}`],
        },
      };
    }
    const differences = changedPaths(base, candidate);
    const actualLicense = licenseExpression(candidate);
    if (actualLicense !== source.license.expression) {
      return {
        report: {
          ...offline,
          candidate_sha: remote.candidate,
          conclusion: "license-changed",
          changed_paths: differences,
          license: {
            expected: source.license.expression,
            actual: actualLicense,
            status: actualLicense === null ? "missing" : "changed",
          },
          patch: { ...offline.patch, base: "applied" },
        },
      };
    }
    if (differences.length === 0) {
      return {
        report: {
          ...offline,
          candidate_sha: remote.candidate,
          conclusion: "no-changes",
          license: { expected: source.license.expression, actual: actualLicense, status: "unchanged" },
          patch: { ...offline.patch, base: "applied", candidate: "applied" },
        },
      };
    }

    const oldPaths = new Set(base.map((entry) => entry.path));
    const newPaths = new Set(candidate.map((entry) => entry.path));
    const unapprovedDeletions = [...oldPaths].filter((pathname) => !newPaths.has(pathname));
    if (unapprovedDeletions.length > 0) {
      return {
        report: {
          ...offline,
          candidate_sha: remote.candidate,
          conclusion: "conflict",
          changed_paths: differences,
          license: { expected: source.license.expression, actual: actualLicense, status: "unchanged" },
          patch: { ...offline.patch, base: "applied", candidate: "conflict" },
          verification: [...offline.verification, `unapproved-deletions:${unapprovedDeletions.sort().join(",")}`],
        },
      };
    }

    try {
      const patched = replayPatches(root, artifact, candidate);
      validateEntries(patched, effectivePolicy(manifest, artifact), `${artifact.id} candidate`);
      return {
        report: {
          ...offline,
          candidate_sha: remote.candidate,
          conclusion: "update-available",
          changed_paths: differences,
          license: { expected: source.license.expression, actual: actualLicense, status: "unchanged" },
          patch: { ...offline.patch, base: "applied", candidate: "applied" },
          verification: [...offline.verification, "base-tree-digest", "candidate-selection", "license", "candidate-patch"],
        },
        selected: candidate,
        patched,
        candidateDate: commitTimestamp(remote.gitDirectory, remote.candidate),
      };
    } catch {
      return {
        report: {
          ...offline,
          candidate_sha: remote.candidate,
          conclusion: "conflict",
          changed_paths: differences,
          license: { expected: source.license.expression, actual: actualLicense, status: "unchanged" },
          patch: { ...offline.patch, base: "applied", candidate: "conflict" },
          verification: [...offline.verification, "candidate-patch-conflict"],
        },
      };
    }
  } finally {
    remote.cleanup();
  }
}

interface TrackedSnapshot {
  files: ReadonlyMap<string, { bytes: Buffer; mode: number }>;
}

function requireCleanWorktree(root: string): void {
  const status = runText("git", ["status", "--porcelain", "--untracked-files=all"], root);
  if (status) throw new SyncError("update mode requires a clean worktree");
}

function snapshotTrackedFiles(root: string): TrackedSnapshot {
  const files = new Map<string, { bytes: Buffer; mode: number }>();
  for (const repositoryPath of run("git", ["ls-files", "-z"], root).toString("utf8").split("\0").filter(Boolean)) {
    const absolute = safeAbsolute(root, repositoryPath);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) throw new SyncError(`tracked path '${repositoryPath}' is not a regular file`);
    files.set(repositoryPath, { bytes: fs.readFileSync(absolute), mode: stat.mode & 0o777 });
  }
  return { files };
}

function restoreSnapshot(root: string, snapshot: TrackedSnapshot): void {
  const status = run("git", ["status", "--porcelain", "-z", "--untracked-files=all"], root)
    .toString("utf8").split("\0").filter(Boolean);
  for (const entry of status) {
    if (!entry.startsWith("?? ")) continue;
    const repositoryPath = entry.slice(3);
    const absolute = safeAbsolute(root, repositoryPath);
    fs.rmSync(absolute, { recursive: true, force: true });
  }
  for (const [repositoryPath, file] of snapshot.files) {
    const absolute = safeAbsolute(root, repositoryPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.bytes, { mode: file.mode });
  }
}

function updateManifestLock(
  root: string,
  sourceId: string,
  artifactId: string,
  candidateSha: FullSha,
  candidateDate: string,
  baseDigest: Sha256Digest,
  localDigest: Sha256Digest,
): void {
  const manifestPath = path.join(root, "upstream.yaml");
  const document = YAML.parseDocument(fs.readFileSync(manifestPath, "utf8"));
  if (document.errors.length > 0) throw new SyncError(`upstream.yaml: ${document.errors[0].message}`);
  const raw = document.toJS() as Record<string, unknown>;
  const sources = raw.sources as Record<string, unknown>[];
  const sourceIndex = sources.findIndex((source) => source.id === sourceId);
  if (sourceIndex === -1) throw new SyncError(`manifest source '${sourceId}' disappeared`);
  const artifacts = sources[sourceIndex].artifacts as Record<string, unknown>[];
  const artifactIndex = artifacts.findIndex((artifact) => artifact.id === artifactId);
  if (artifactIndex === -1) throw new SyncError(`manifest artifact '${artifactId}' disappeared`);
  const base = ["sources", sourceIndex, "artifacts", artifactIndex] as const;
  document.setIn([...base, "base_sha"], candidateSha);
  document.setIn([...base, "base_tree_digest"], baseDigest);
  document.setIn([...base, "local_tree_digest"], localDigest);
  document.setIn([...base, "checked_sha"], candidateSha);
  document.setIn([...base, "checked_at"], candidateDate);
  document.setIn([...base, "candidate_sha"], null);
  document.setIn([...base, "imported_at"], candidateDate);
  fs.writeFileSync(manifestPath, document.toString({ lineWidth: 0 }));
}

function defaultVerification(root: string): readonly string[] {
  run("bun", ["run", "build"], root);
  run("bun", ["test"], root);
  run("bun", ["run", "validate"], root);
  return ["bun run build", "bun test", "bun run validate"];
}

function carryUnownedFiles(
  source: string,
  stage: string,
  owned: readonly TreeEntry[],
): void {
  const ownedPaths = new Set(owned.map((entry) => entry.path));
  const visit = (directory: string, prefix = ""): void => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) {
        visit(absolute, relative);
        continue;
      }
      if (!item.isFile() || ownedPaths.has(relative)) continue;
      const target = safeAbsolute(stage, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(absolute, target);
    }
  };
  visit(source);
}

function installCandidate(
  root: string,
  manifest: UpstreamManifest,
  source: UpstreamSource,
  artifact: UpstreamArtifact & { status: "active" },
  result: CandidateResult & { selected: readonly TreeEntry[]; patched: readonly TreeEntry[]; candidateDate: string },
  options: UpdateOptions,
): ArtifactReport {
  const candidateSha = result.report.candidate_sha;
  if (!candidateSha) throw new SyncError(`${artifact.id}: candidate SHA is missing`);
  const snapshot = snapshotTrackedFiles(root);
  const localDirectory = safeAbsolute(root, artifact.localPath);
  const parent = path.dirname(localDirectory);
  const stage = path.join(parent, `.trove-sync-stage-${process.pid}-${artifact.id}`);
  const backup = path.join(parent, `.trove-sync-backup-${process.pid}-${artifact.id}`);
  if (fs.existsSync(stage) || fs.existsSync(backup)) throw new SyncError(`${artifact.id}: stale update staging path exists`);
  try {
    fs.mkdirSync(stage, { recursive: true });
    writeEntries(stage, result.patched);
    // The swap replaces the whole directory, but walkLocal deliberately
    // ignores generated SKILL.md files, so they are absent from
    // result.patched. Carry them across so the rename never destroys a file
    // the sync does not own. `bun run build` rewrites them afterwards; this
    // keeps the swap non-destructive even when verification is customized.
    carryUnownedFiles(localDirectory, stage, result.patched);
    fs.renameSync(localDirectory, backup);
    fs.renameSync(stage, localDirectory);
    updateManifestLock(
      root,
      source.id,
      artifact.id,
      candidateSha,
      result.candidateDate,
      digestTree(result.selected),
      digestTree(result.patched),
    );
    const verification = (options.verify ?? defaultVerification)(root);
    fs.rmSync(backup, { recursive: true, force: true });
    return {
      ...result.report,
      conclusion: "updated",
      verification: [...result.report.verification, ...verification],
    };
  } catch (error) {
    restoreSnapshot(root, snapshot);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
    return {
      ...result.report,
      conclusion: "validation-failed",
      verification: [...result.report.verification, `validation-failed:${(error as Error).message}`],
    };
  }
}

export function updateArtifacts(
  root: string,
  manifest: UpstreamManifest,
  selection: { artifactId?: string; sourceId?: string },
  options: UpdateOptions = {},
): SyncReport {
  requireCleanWorktree(root);
  const targets = manifest.sources.flatMap((source) =>
    source.artifacts
      .filter((artifact) => selection.artifactId ? artifact.id === selection.artifactId : source.id === selection.sourceId)
      .map((artifact) => ({ source, artifact })),
  );
  if (targets.length === 0) {
    throw new SyncError(selection.artifactId
      ? `unknown artifact '${selection.artifactId}'`
      : `unknown or empty source '${selection.sourceId ?? ""}'`);
  }

  const reports: ArtifactReport[] = [];
  for (const { source, artifact } of targets) {
    const currentManifest = manifest;
    const result = candidateResult(root, currentManifest, source, artifact);
    if (
      artifact.status === "active" &&
      result.report.conclusion === "update-available" &&
      result.selected && result.patched && result.candidateDate
    ) {
      reports.push(installCandidate(
        root,
        currentManifest,
        source,
        artifact,
        result as CandidateResult & { selected: readonly TreeEntry[]; patched: readonly TreeEntry[]; candidateDate: string },
        options,
      ));
    } else {
      reports.push(result.report);
    }
    if (!["no-changes", "updated"].includes(reports.at(-1)?.conclusion ?? "")) break;
  }
  return { schema_version: 1, mode: "update", artifacts: reports };
}

export function stableJson(report: SyncReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderMarkdown(report: SyncReport): string {
  const lines = [
    "# Upstream sync report",
    "",
    `Mode: ${report.mode}`,
    "",
    "| Artifact | Base | Candidate | Conclusion | Changed paths |",
    "|---|---|---|---|---|",
  ];
  for (const artifact of report.artifacts) {
    lines.push(
      `| ${artifact.artifact} | ${artifact.old_sha ?? "unproven"} | ${artifact.candidate_sha ?? "not checked"} | ${artifact.conclusion} | ${artifact.changed_paths.join("<br>") || "none"} |`,
    );
  }
  for (const artifact of report.artifacts) {
    lines.push(
      "",
      `## ${artifact.artifact}`,
      "",
      `License: ${artifact.license.status} (${artifact.license.actual ?? "missing"}; expected ${artifact.license.expected})`,
      "",
      `Patch: digest ${artifact.patch.digest}, base ${artifact.patch.base}, candidate ${artifact.patch.candidate}`,
      "",
      "Verification:",
      "",
      ...artifact.verification.map((check) => `- ${check}`),
    );
  }
  return `${lines.join("\n")}\n`;
}
