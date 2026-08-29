import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";

export type FullSha = string & { readonly __brand: "FullSha" };
export type Sha256Digest = string & { readonly __brand: "Sha256Digest" };
export type RepositoryPath = string & { readonly __brand: "RepositoryPath" };

export interface UpstreamPolicy {
  maximumFileBytes: number;
  maximumArtifactBytes: number;
  allowBinary: boolean;
  allowGenerated: boolean;
}

export interface LicenseRecord {
  expression: string;
  evidence: RepositoryPath;
}

export type ArtifactTransform =
  | { kind: "rename-skill"; from: string; to: string }
  | { kind: "inject-preamble"; marker: string }
  | {
      kind: "replace-literal";
      path: RepositoryPath;
      from: string;
      to: string;
      minimumOccurrences: number;
    };

const CANONICAL_PREFIXES = ["references/", "scripts/"] as const;

export function isCanonicalArtifactPath(candidate: string): boolean {
  return candidate === "SKILL.md.tmpl" ||
    CANONICAL_PREFIXES.some((prefix) => candidate.startsWith(prefix));
}

interface ArtifactCommon {
  id: string;
  upstreamPath: RepositoryPath;
  localPath: RepositoryPath;
  checkedSha: FullSha;
  checkedAt: string;
  candidateSha: FullSha | null;
  include: readonly string[];
  exclude: readonly string[];
  pathMap: Readonly<Record<string, string>>;
  transforms: readonly ArtifactTransform[];
  patches: readonly RepositoryPath[];
  localOnly: readonly string[];
  policy: Pick<UpstreamPolicy, "maximumFileBytes" | "maximumArtifactBytes"> | null;
}

export type UpstreamArtifact =
  | (ArtifactCommon & {
      status: "active";
      baseSha: FullSha;
      baseTreeDigest: Sha256Digest;
      localTreeDigest: Sha256Digest;
      patchDigest: Sha256Digest;
      importedAt: string;
    })
  | (ArtifactCommon & {
      status: "blocked-unproven-base";
      baseSha: null;
      baseTreeDigest: null;
      localTreeDigest: null;
      patchDigest: null;
      importedAt: null;
    });

export interface UpstreamSource {
  id: string;
  repository: string;
  ref: string;
  license: LicenseRecord;
  artifacts: readonly UpstreamArtifact[];
}

export type SkillOrigin =
  | { localPath: RepositoryPath; origin: "original" }
  | {
      localPath: RepositoryPath;
      origin: "adapted";
      sourceId: string;
      upstreamPath: RepositoryPath;
      evidenceSha: FullSha;
    };

export interface ExternalRecord {
  localPath: RepositoryPath;
  repository: string | null;
  revision: FullSha | null;
  note?: string;
}

export interface UpstreamManifest {
  version: 2;
  policy: UpstreamPolicy;
  sources: readonly UpstreamSource[];
  skills: readonly SkillOrigin[];
  externalRecords: readonly ExternalRecord[];
  notVendored: Readonly<Record<string, readonly string[]>>;
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export interface ManifestParseOptions {
  allowFileRepositories?: boolean;
}

function fail(where: string, message: string): never {
  throw new ManifestError(`${where}: ${message}`);
}

function objectAt(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(where, "must be a mapping");
  }
  return value as Record<string, unknown>;
}

function strictKeys(
  value: Record<string, unknown>,
  where: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(where, `unknown key '${key}'`);
  }
  for (const key of required) {
    if (!(key in value)) fail(where, `missing key '${key}'`);
  }
}

function stringAt(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) fail(where, "must be a non-empty string");
  return value;
}

function booleanAt(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") fail(where, "must be a boolean");
  return value;
}

function positiveIntegerAt(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    fail(where, "must be a positive safe integer");
  }
  return value;
}

function arrayAt(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(where, "must be an array");
  return value;
}

function stringArrayAt(value: unknown, where: string, allowEmpty = false): readonly string[] {
  const values = arrayAt(value, where).map((entry, index) => stringAt(entry, `${where}[${index}]`));
  if (!allowEmpty && values.length === 0) fail(where, "must not be empty");
  if (new Set(values).size !== values.length) fail(where, "must not contain duplicates");
  return values;
}

function fullShaAt(value: unknown, where: string): FullSha {
  const sha = stringAt(value, where);
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(where, "must be a full lowercase 40-character SHA");
  return sha as FullSha;
}

function nullableFullShaAt(value: unknown, where: string): FullSha | null {
  return value === null ? null : fullShaAt(value, where);
}

function digestAt(value: unknown, where: string): Sha256Digest {
  const digest = stringAt(value, where);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) fail(where, "must be a sha256 digest");
  return digest as Sha256Digest;
}

function nullableDigestAt(value: unknown, where: string): Sha256Digest | null {
  return value === null ? null : digestAt(value, where);
}

function timestampAt(value: unknown, where: string): string {
  const timestamp = stringAt(value, where);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) {
    fail(where, "must be an ISO-8601 UTC timestamp with second precision");
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) fail(where, "must be a valid timestamp");
  // Date.parse silently rolls over impossible calendar dates: 2026-02-31
  // becomes 2026-03-03. Round-trip the parsed value so only real dates pass.
  if (new Date(parsed).toISOString().replace(".000Z", "Z") !== timestamp) {
    fail(where, "must be a real calendar date");
  }
  return timestamp;
}

function nullableTimestampAt(value: unknown, where: string): string | null {
  return value === null ? null : timestampAt(value, where);
}

export function repositoryPathAt(value: unknown, where: string): RepositoryPath {
  const candidate = stringAt(value, where);
  if (candidate.includes("\\") || candidate.includes("\0")) {
    fail(where, "must use normalized POSIX separators");
  }
  if (path.posix.isAbsolute(candidate) || candidate === ".") fail(where, "must be repository-relative");
  const segments = candidate.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(where, "must not contain empty, '.' or '..' segments");
  }
  if (path.posix.normalize(candidate) !== candidate) fail(where, "must be normalized");
  return candidate as RepositoryPath;
}

function patternAt(value: unknown, where: string): string {
  const candidate = stringAt(value, where);
  if (candidate.includes("\\") || candidate.includes("\0") || path.posix.isAbsolute(candidate)) {
    fail(where, "must be a repository-relative POSIX pattern");
  }
  if (candidate.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(where, "must not contain empty, '.' or '..' segments");
  }
  if (/[*?[\]]/.test(candidate.replace(/\*\*/g, ""))) {
    fail(where, "only the '**' wildcard is supported");
  }
  return candidate;
}

function idAt(value: unknown, where: string): string {
  const id = stringAt(value, where);
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(where, "must be lowercase kebab-case");
  if (id.length > 64) fail(where, "must not exceed 64 characters");
  return id;
}

function repositoryUrlAt(value: unknown, where: string, options: ManifestParseOptions): string {
  const repository = stringAt(value, where);
  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    return fail(where, "must be an absolute URL");
  }
  if (url.protocol !== "https:" && !(options.allowFileRepositories && url.protocol === "file:")) {
    fail(where, "must use https");
  }
  if (url.username || url.password) fail(where, "must not embed credentials");
  return repository;
}

function parseLicense(value: unknown, where: string): LicenseRecord {
  const record = objectAt(value, where);
  strictKeys(record, where, ["expression", "evidence"]);
  return {
    expression: stringAt(record.expression, `${where}.expression`),
    evidence: repositoryPathAt(record.evidence, `${where}.evidence`),
  };
}

function parseTransform(value: unknown, where: string): ArtifactTransform {
  const record = objectAt(value, where);
  const kind = stringAt(record.kind, `${where}.kind`);
  if (kind === "rename-skill") {
    strictKeys(record, where, ["kind", "from", "to"]);
    return {
      kind,
      from: idAt(record.from, `${where}.from`),
      to: idAt(record.to, `${where}.to`),
    };
  }
  if (kind === "inject-preamble") {
    strictKeys(record, where, ["kind", "marker"]);
    return { kind, marker: stringAt(record.marker, `${where}.marker`) };
  }
  if (kind === "replace-literal") {
    strictKeys(record, where, ["kind", "path", "from", "to", "minimum_occurrences"]);
    const pathname = repositoryPathAt(record.path, `${where}.path`);
    if (!isCanonicalArtifactPath(pathname)) {
      fail(`${where}.path`, "must be SKILL.md.tmpl or under references/ or scripts/");
    }
    return {
      kind,
      path: pathname,
      from: stringAt(record.from, `${where}.from`),
      to: stringAt(record.to, `${where}.to`),
      minimumOccurrences: positiveIntegerAt(record.minimum_occurrences, `${where}.minimum_occurrences`),
    };
  }
  return fail(`${where}.kind`, `unsupported transform '${kind}'`);
}

function parsePathMap(value: unknown, where: string): Readonly<Record<string, string>> {
  const record = objectAt(value, where);
  const result: Record<string, string> = {};
  for (const [rawFrom, rawTo] of Object.entries(record)) {
    const fromPrefix = rawFrom.endsWith("/");
    const toValue = stringAt(rawTo, `${where}.${rawFrom}`);
    const toPrefix = toValue.endsWith("/");
    if (fromPrefix !== toPrefix) fail(`${where}.${rawFrom}`, "source and target must both be file paths or both be directory prefixes");
    const from = repositoryPathAt(fromPrefix ? rawFrom.slice(0, -1) : rawFrom, `${where}.${rawFrom}`);
    const to = repositoryPathAt(toPrefix ? toValue.slice(0, -1) : toValue, `${where}.${rawFrom}`);
    result[`${from}${fromPrefix ? "/" : ""}`] = `${to}${toPrefix ? "/" : ""}`;
  }
  return result;
}

function parseArtifactPolicy(
  value: unknown,
  where: string,
  defaults: UpstreamPolicy,
): Pick<UpstreamPolicy, "maximumFileBytes" | "maximumArtifactBytes"> {
  const record = objectAt(value, where);
  strictKeys(record, where, [], ["maximum_file_bytes", "maximum_artifact_bytes"]);
  if (!("maximum_file_bytes" in record) && !("maximum_artifact_bytes" in record)) {
    fail(where, "must set maximum_file_bytes or maximum_artifact_bytes");
  }
  const override: Pick<UpstreamPolicy, "maximumFileBytes" | "maximumArtifactBytes"> = {
    maximumFileBytes: defaults.maximumFileBytes,
    maximumArtifactBytes: defaults.maximumArtifactBytes,
  };
  if ("maximum_file_bytes" in record) {
    const bytes = positiveIntegerAt(record.maximum_file_bytes, `${where}.maximum_file_bytes`);
    if (bytes < defaults.maximumFileBytes) {
      fail(`${where}.maximum_file_bytes`, "must not lower the manifest maximum_file_bytes");
    }
    override.maximumFileBytes = bytes;
  }
  if ("maximum_artifact_bytes" in record) {
    const bytes = positiveIntegerAt(record.maximum_artifact_bytes, `${where}.maximum_artifact_bytes`);
    if (bytes < defaults.maximumArtifactBytes) {
      fail(`${where}.maximum_artifact_bytes`, "must not lower the manifest maximum_artifact_bytes");
    }
    override.maximumArtifactBytes = bytes;
  }
  if (override.maximumArtifactBytes < override.maximumFileBytes) {
    fail(where, "maximum_artifact_bytes must be at least maximum_file_bytes");
  }
  return override;
}

export function effectivePolicy(manifest: UpstreamManifest, artifact: UpstreamArtifact): UpstreamPolicy {
  if (!artifact.policy) return manifest.policy;
  return {
    ...manifest.policy,
    maximumFileBytes: artifact.policy.maximumFileBytes,
    maximumArtifactBytes: artifact.policy.maximumArtifactBytes,
  };
}

function parseArtifact(value: unknown, where: string, defaults: UpstreamPolicy): UpstreamArtifact {
  const record = objectAt(value, where);
  strictKeys(record, where, [
    "id", "upstream_path", "local_path", "base_sha", "base_tree_digest",
    "local_tree_digest", "patch_digest", "checked_sha", "checked_at",
    "candidate_sha", "imported_at", "include", "exclude", "path_map",
    "transforms", "patches", "status",
  ], ["local_only", "policy"]);

  const status = stringAt(record.status, `${where}.status`);
  if (status !== "active" && status !== "blocked-unproven-base") {
    fail(`${where}.status`, "must be 'active' or 'blocked-unproven-base'");
  }

  const common: ArtifactCommon = {
    id: idAt(record.id, `${where}.id`),
    upstreamPath: repositoryPathAt(record.upstream_path, `${where}.upstream_path`),
    localPath: repositoryPathAt(record.local_path, `${where}.local_path`),
    checkedSha: fullShaAt(record.checked_sha, `${where}.checked_sha`),
    checkedAt: timestampAt(record.checked_at, `${where}.checked_at`),
    candidateSha: nullableFullShaAt(record.candidate_sha, `${where}.candidate_sha`),
    include: stringArrayAt(record.include, `${where}.include`).map((pattern, index) =>
      patternAt(pattern, `${where}.include[${index}]`)),
    exclude: stringArrayAt(record.exclude, `${where}.exclude`, true).map((pattern, index) =>
      patternAt(pattern, `${where}.exclude[${index}]`)),
    pathMap: parsePathMap(record.path_map, `${where}.path_map`),
    transforms: arrayAt(record.transforms, `${where}.transforms`).map((entry, index) =>
      parseTransform(entry, `${where}.transforms[${index}]`)),
    patches: stringArrayAt(record.patches, `${where}.patches`, true).map((entry, index) =>
      repositoryPathAt(entry, `${where}.patches[${index}]`)),
    localOnly: record.local_only === undefined
      ? []
      : stringArrayAt(record.local_only, `${where}.local_only`, true).map((pattern, index) =>
        patternAt(pattern, `${where}.local_only[${index}]`)),
    policy: record.policy === undefined ? null : parseArtifactPolicy(record.policy, `${where}.policy`, defaults),
  };

  const baseSha = nullableFullShaAt(record.base_sha, `${where}.base_sha`);
  const baseTreeDigest = nullableDigestAt(record.base_tree_digest, `${where}.base_tree_digest`);
  const localTreeDigest = nullableDigestAt(record.local_tree_digest, `${where}.local_tree_digest`);
  const patchDigest = nullableDigestAt(record.patch_digest, `${where}.patch_digest`);
  const importedAt = nullableTimestampAt(record.imported_at, `${where}.imported_at`);

  if (status === "active") {
    if (!baseSha || !baseTreeDigest || !localTreeDigest || !patchDigest || !importedAt) {
      fail(where, "active artifacts require non-null base, local, patch, and import lock fields");
    }
    return { ...common, status, baseSha, baseTreeDigest, localTreeDigest, patchDigest, importedAt };
  }
  if (baseSha || baseTreeDigest || localTreeDigest || patchDigest || importedAt) {
    fail(where, "blocked artifacts require null base, local, patch, and import lock fields");
  }
  return {
    ...common,
    status,
    baseSha: null,
    baseTreeDigest: null,
    localTreeDigest: null,
    patchDigest: null,
    importedAt: null,
  };
}

function parseSource(
  value: unknown,
  where: string,
  options: ManifestParseOptions,
  defaults: UpstreamPolicy,
): UpstreamSource {
  const record = objectAt(value, where);
  strictKeys(record, where, ["id", "repository", "ref", "license", "artifacts"]);
  const repository = repositoryUrlAt(record.repository, `${where}.repository`, options);
  const ref = stringAt(record.ref, `${where}.ref`);
  if (
    ref.startsWith("-") ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) ||
    ref.includes("..") ||
    ref.includes("//") ||
    ref.includes("@{") ||
    ref.endsWith("/") ||
    ref.endsWith(".") ||
    ref.endsWith(".lock")
  ) {
    fail(`${where}.ref`, "must be a safe branch or tag name");
  }
  return {
    id: idAt(record.id, `${where}.id`),
    repository,
    ref,
    license: parseLicense(record.license, `${where}.license`),
    artifacts: arrayAt(record.artifacts, `${where}.artifacts`).map((entry, index) =>
      parseArtifact(entry, `${where}.artifacts[${index}]`, defaults)),
  };
}

function parseSkill(value: unknown, where: string): SkillOrigin {
  const record = objectAt(value, where);
  const origin = stringAt(record.origin, `${where}.origin`);
  if (origin === "original") {
    strictKeys(record, where, ["local_path", "origin"]);
    return { localPath: repositoryPathAt(record.local_path, `${where}.local_path`), origin };
  }
  if (origin === "adapted") {
    strictKeys(record, where, ["local_path", "origin", "source_id", "upstream_path", "evidence_sha"]);
    return {
      localPath: repositoryPathAt(record.local_path, `${where}.local_path`),
      origin,
      sourceId: idAt(record.source_id, `${where}.source_id`),
      upstreamPath: repositoryPathAt(record.upstream_path, `${where}.upstream_path`),
      evidenceSha: fullShaAt(record.evidence_sha, `${where}.evidence_sha`),
    };
  }
  return fail(`${where}.origin`, "must be 'original' or 'adapted'");
}

function parseExternalRecord(
  value: unknown,
  where: string,
  options: ManifestParseOptions,
): ExternalRecord {
  const record = objectAt(value, where);
  strictKeys(record, where, ["local_path", "repository", "revision"], ["note"]);
  const repository = record.repository === null
    ? null
    : repositoryUrlAt(record.repository, `${where}.repository`, options);
  const revision = nullableFullShaAt(record.revision, `${where}.revision`);
  if ((repository === null) !== (revision === null)) {
    fail(where, "repository and revision must either both be set or both be null");
  }
  return {
    localPath: repositoryPathAt(record.local_path, `${where}.local_path`),
    repository,
    revision,
    ...(record.note === undefined ? {} : { note: stringAt(record.note, `${where}.note`) }),
  };
}

export function parseUpstreamManifest(
  raw: unknown,
  options: ManifestParseOptions = {},
): UpstreamManifest {
  const record = objectAt(raw, "manifest");
  strictKeys(record, "manifest", ["version", "policy", "sources", "skills", "external_records", "not_vendored"]);
  if (record.version !== 2) fail("manifest.version", "must equal 2");

  const policyRecord = objectAt(record.policy, "manifest.policy");
  strictKeys(policyRecord, "manifest.policy", ["maximum_file_bytes", "maximum_artifact_bytes", "allow_binary", "allow_generated"]);
  const policy: UpstreamPolicy = {
    maximumFileBytes: positiveIntegerAt(policyRecord.maximum_file_bytes, "manifest.policy.maximum_file_bytes"),
    maximumArtifactBytes: positiveIntegerAt(policyRecord.maximum_artifact_bytes, "manifest.policy.maximum_artifact_bytes"),
    allowBinary: booleanAt(policyRecord.allow_binary, "manifest.policy.allow_binary"),
    allowGenerated: booleanAt(policyRecord.allow_generated, "manifest.policy.allow_generated"),
  };
  if (policy.maximumArtifactBytes < policy.maximumFileBytes) {
    fail("manifest.policy", "maximum_artifact_bytes must be at least maximum_file_bytes");
  }

  const sources = arrayAt(record.sources, "manifest.sources").map((entry, index) =>
    parseSource(entry, `manifest.sources[${index}]`, options, policy));
  const skills = arrayAt(record.skills, "manifest.skills").map((entry, index) =>
    parseSkill(entry, `manifest.skills[${index}]`));
  const externalRecords = arrayAt(record.external_records, "manifest.external_records").map((entry, index) =>
    parseExternalRecord(entry, `manifest.external_records[${index}]`, options));

  const notVendoredRecord = objectAt(record.not_vendored, "manifest.not_vendored");
  const notVendored: Record<string, readonly string[]> = {};
  for (const [sourceId, entries] of Object.entries(notVendoredRecord)) {
    const id = idAt(sourceId, `manifest.not_vendored.${sourceId}`);
    notVendored[id] = stringArrayAt(entries, `manifest.not_vendored.${sourceId}`).map((entry, index) =>
      idAt(entry, `manifest.not_vendored.${sourceId}[${index}]`));
  }

  const sourceIds = sources.map((source) => source.id);
  if (new Set(sourceIds).size !== sourceIds.length) fail("manifest.sources", "source ids must be unique");
  const sourceIdSet = new Set(sourceIds);

  const artifactIds = sources.flatMap((source) => source.artifacts.map((artifact) => artifact.id));
  if (new Set(artifactIds).size !== artifactIds.length) fail("manifest.sources", "artifact ids must be globally unique");
  const artifacts = sources.flatMap((source) => source.artifacts.map((artifact) => ({ source, artifact })));
  const artifactPaths = artifacts.map(({ artifact }) => artifact.localPath);
  if (new Set(artifactPaths).size !== artifactPaths.length) {
    fail("manifest.sources", "artifact local_path values must be globally unique");
  }

  const skillPaths = skills.map((skill) => skill.localPath);
  if (new Set(skillPaths).size !== skillPaths.length) fail("manifest.skills", "local_path values must be unique");
  for (const skill of skills) {
    if (!skill.localPath.startsWith("skills/")) fail(`manifest.skills.${skill.localPath}`, "must live below skills/");
    if (skill.origin === "adapted" && !sourceIdSet.has(skill.sourceId)) {
      fail(`manifest.skills.${skill.localPath}.source_id`, `unknown source '${skill.sourceId}'`);
    }
  }
  for (const { source, artifact } of artifacts) {
    if (!artifact.localPath.startsWith("skills/")) {
      fail(`manifest.sources.${source.id}.${artifact.id}.local_path`, "must live below skills/");
    }
    const matchingSkill = skills.find((skill) => skill.localPath === artifact.localPath);
    if (
      !matchingSkill ||
      matchingSkill.origin !== "adapted" ||
      matchingSkill.sourceId !== source.id ||
      matchingSkill.upstreamPath !== artifact.upstreamPath
    ) {
      fail(
        `manifest.sources.${source.id}.${artifact.id}`,
        "must match an adapted skill with the same source and upstream path",
      );
    }
    for (const patch of artifact.patches) {
      if (!patch.startsWith(`upstream-patches/${artifact.id}/`)) {
        fail(
          `manifest.sources.${source.id}.${artifact.id}.patches`,
          `must live below upstream-patches/${artifact.id}/`,
        );
      }
    }
  }
  for (const sourceId of Object.keys(notVendored)) {
    if (!sourceIdSet.has(sourceId)) fail(`manifest.not_vendored.${sourceId}`, "references an unknown source");
  }

  return { version: 2, policy, sources, skills, externalRecords, notVendored };
}

export function loadUpstreamManifest(
  root: string,
  manifestPath = "upstream.yaml",
  options: ManifestParseOptions = {},
): UpstreamManifest {
  const absolute = path.resolve(root, manifestPath);
  let parsed: unknown;
  try {
    parsed = YAML.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    if (error instanceof ManifestError) throw error;
    throw new ManifestError(`${path.relative(root, absolute)}: ${(error as Error).message}`);
  }
  return parseUpstreamManifest(parsed, options);
}

export function collectCanonicalSkillPaths(root: string): readonly RepositoryPath[] {
  const result: RepositoryPath[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name === "SKILL.md.tmpl") {
        result.push(path.relative(root, path.dirname(absolute)).replaceAll(path.sep, "/") as RepositoryPath);
      }
    }
  };
  visit(path.join(root, "skills"));
  return result.sort();
}

export function validateManifestInventory(manifest: UpstreamManifest, root: string): void {
  const actual = collectCanonicalSkillPaths(root);
  const declared = manifest.skills.map((skill) => skill.localPath).sort();
  const missing = actual.filter((entry) => !declared.includes(entry));
  const extra = declared.filter((entry) => !actual.includes(entry));
  if (missing.length || extra.length) {
    fail("manifest.skills", `inventory mismatch; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`);
  }
  for (const external of manifest.externalRecords) {
    const absolute = path.resolve(root, external.localPath);
    if (!absolute.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(absolute)) {
      fail(`manifest.external_records.${external.localPath}`, "local path does not exist inside the repository");
    }
  }
}
