import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { parseUpstreamManifest, repositoryPathAt } from "../upstream-manifest";
import {
  digestTree,
  lockEntries,
  readGitSelection,
  transformSelection,
  writeEntries,
  type TreeEntry,
} from "../upstream-sync";
import type { ImportMode, ImportReport, ProposedTransform, Selection } from "./types";

export interface StageRequest {
  mode: ImportMode;
  id: string;
  plugin: string;
  category: string;
  selection: Selection;
  report: ImportReport;
  dryRun: boolean;
  /** Defaults to this repository; override for fixture repositories. */
  root?: string;
  /** Paths in selection are relative to this directory (defaults to repository root). */
  upstreamPath?: string;
  sourceId?: string;
  /** Defaults to the resolved SHA so the draft source remains pinned. */
  ref?: string;
  renameSkill?: { from: string; to: string };
  preambleMarker?: string;
  /** Only explicitly accepted transforms run; report.proposedTransforms is advisory. */
  acceptedTransforms?: readonly ProposedTransform[];
  localOnly?: readonly string[];
  /** Required unless the upstream skill frontmatter declares its license. */
  licenseExpression?: string;
  /** Repository-relative license blob path, default LICENSE. */
  licensePath?: string;
  /** May be supplied by the license review step instead of reading the blob. */
  licenseText?: string;
  /**
   * The front-plus-spec split (plan §3.1), a caller choice: upstream SKILL.md is
   * byte-synced to references/runtime-spec.md, and a local_only SKILL.md.tmpl
   * front is staged for the maintainer to write.
   */
  splitFront?: boolean;
}

const RUNTIME_SPEC = "references/runtime-spec.md";
const FRONT = "SKILL.md.tmpl";

export interface StageResult {
  /** The removed upstream allowed-tools value, or null when none was declared. */
  allowedTools: unknown;
}

function readLicense(request: StageRequest): Buffer {
  if (request.licenseText !== undefined) return Buffer.from(request.licenseText, "utf8");
  const licensePath = repositoryPathAt(request.licensePath ?? "LICENSE", "licensePath");
  const source = request.report.source;
  const result = spawnSync("git", ["--git-dir", source.gitDirectory, "cat-file", "blob", `${source.resolvedSha}:${licensePath}`], { encoding: null });
  if (result.status !== 0) throw new Error(`cannot read upstream license '${licensePath}': ${result.stderr?.toString("utf8").trim()}`);
  return result.stdout;
}

function frontmatter(content: string) {
  if (!content.startsWith("---\n")) throw new Error("upstream SKILL.md has no frontmatter");
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("upstream SKILL.md frontmatter is not closed");
  const text = content.slice(4, end);
  const document = YAML.parseDocument(text);
  if (document.errors.length > 0) throw new Error(document.errors[0].message);
  if (!YAML.isMap(document.contents)) throw new Error("upstream SKILL.md frontmatter must be a mapping");
  return { text, document };
}

/**
 * Cuts one top-level key out of frontmatter text and leaves every other byte
 * alone. Re-serializing the document would fold long scalars and restyle flow
 * collections, so the stored transform would rewrite fields it never meant to touch.
 */
function withoutKey(text: string, document: YAML.Document, key: string): string {
  const map = document.contents;
  const pair = YAML.isMap(map) ? map.items.find((item) => YAML.isScalar(item.key) && item.key.value === key) : undefined;
  const keyRange = YAML.isNode(pair?.key) ? pair.key.range : undefined;
  if (!pair || !keyRange) throw new Error(`frontmatter key '${key}' was not found`);
  const valueEnd = (YAML.isNode(pair.value) ? pair.value.range?.[2] : undefined) ?? keyRange[2];
  const start = text.lastIndexOf("\n", keyRange[0] - 1) + 1;
  const newline = text[valueEnd - 1] === "\n" ? valueEnd - 1 : text.indexOf("\n", valueEnd);
  const result = newline === -1
    ? text.slice(0, Math.max(0, start - 1))
    : `${text.slice(0, start)}${text.slice(newline + 1)}`;
  const expected = document.toJS() as Record<string, unknown>;
  delete expected[key];
  if (JSON.stringify(YAML.parse(result) ?? {}) !== JSON.stringify(expected)) {
    throw new Error(`cannot remove '${key}' from the upstream frontmatter without changing other fields`);
  }
  return result;
}

/** A placeholder front that validates and routes to the synced manual; the maintainer rewrites it. */
function frontStub(id: string, description: string): string {
  return [
    "---",
    `name: ${id}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    "{{PREAMBLE}}",
    "",
    `# ${id}`,
    "",
    `Read \`${RUNTIME_SPEC}\` before the first job in a session. It is the operating manual; do not restate it here.`,
    "",
  ].join("\n");
}

function assertSafeDestination(root: string, localPath: string): string {
  let current = root;
  for (const segment of localPath.split("/")) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) {
      // existsSync does not detect dangling symlinks.
      try {
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`staging path contains symlink '${current}'`);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      continue;
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`staging path is not a regular directory '${current}'`);
  }
  if (fs.existsSync(current)) throw new Error(`skill directory already exists '${localPath}'`);
  return current;
}

export async function stageImport(request: StageRequest): Promise<StageResult> {
  if (request.mode !== request.report.mode) throw new Error("staging mode must match the import report");
  if (request.report.findings.some((finding) => finding.severity === "hard-reject")) {
    throw new Error("cannot stage an import with hard-reject findings");
  }
  for (const [label, value] of [["id", request.id], ["category", request.category], ["plugin", request.plugin]]) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(value)) throw new Error(`${label} must be lowercase kebab-case`);
  }
  if (request.splitFront && (request.renameSkill || request.preambleMarker)) {
    throw new Error("a split front carries its own name and preamble; drop renameSkill and preambleMarker");
  }
  const root = path.resolve(request.root ?? path.join(import.meta.dir, "../../.."));
  const localPath = `skills/${request.category}/${request.id}`;
  const directory = assertSafeDestination(root, localPath);
  const manifestPath = path.join(root, "upstream.yaml");
  const document = YAML.parseDocument(fs.readFileSync(manifestPath, "utf8"));
  if (document.errors.length > 0) throw new Error(document.errors[0].message);
  parseUpstreamManifest(document.toJS());

  const sourceId = request.sourceId ?? request.id;
  const source = request.report.source;
  const upstreamPath = request.upstreamPath ?? ".";
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const transforms = [
    ...(request.renameSkill ? [{ kind: "rename-skill", ...request.renameSkill }] : []),
    ...(request.preambleMarker ? [{ kind: "inject-preamble", marker: request.preambleMarker }] : []),
    ...(request.acceptedTransforms ?? []).map((transform) => ({
      kind: transform.kind,
      path: transform.path,
      from: transform.from,
      to: transform.to,
      minimum_occurrences: transform.minimumOccurrences,
    })),
  ];
  const artifactRecord = {
    id: request.id,
    upstream_path: upstreamPath,
    local_path: localPath,
    base_sha: source.resolvedSha,
    base_tree_digest: digestTree([]),
    local_tree_digest: digestTree([]),
    patch_digest: digestTree([]),
    checked_sha: source.resolvedSha,
    checked_at: timestamp,
    candidate_sha: null,
    imported_at: timestamp,
    include: request.selection.include,
    exclude: request.selection.exclude,
    path_map: { "SKILL.md": request.splitFront ? RUNTIME_SPEC : FRONT, ...request.selection.pathMap },
    transforms,
    patches: [],
    // The license comes from outside the selected tree and must survive sync
    // updates, and so must a split front, which Trove writes.
    local_only: [...new Set([
      ...(request.localOnly ?? []),
      ...(request.splitFront ? [FRONT] : []),
      "references/LICENSE.md",
    ])],
    status: "active",
  };
  document.addIn(["sources"], document.createNode({
    id: sourceId,
    repository: source.repository,
    ref: request.ref ?? source.resolvedSha,
    license: { expression: request.licenseExpression ?? "pending", evidence: request.licensePath ?? "LICENSE" },
    artifacts: request.mode === "vendored" ? [artifactRecord] : [],
  }));
  document.addIn(["skills"], document.createNode({
    local_path: localPath,
    origin: "adapted",
    source_id: sourceId,
    upstream_path: upstreamPath,
    evidence_sha: source.resolvedSha,
  }));
  let manifest = parseUpstreamManifest(document.toJS());
  const sourceIndex = manifest.sources.length - 1;
  const stagedSource = manifest.sources[sourceIndex];
  const license = readLicense(request);
  if (license.length === 0) throw new Error("upstream license must not be empty");
  const licenseEntry: TreeEntry = { path: "references/LICENSE.md", mode: "100644", bytes: license };
  let entries: readonly TreeEntry[] = [licenseEntry];
  let allowedTools: unknown = null;

  if (request.mode === "vendored") {
    let artifact = stagedSource.artifacts[0];
    const selected = readGitSelection(source.gitDirectory, artifact.checkedSha, artifact, manifest);
    const transformed = transformSelection(selected, artifact);
    const skillPath = request.splitFront ? RUNTIME_SPEC : FRONT;
    const skill = transformed.find((entry) => entry.path === skillPath);
    if (!skill) throw new Error(`vendored imports require mapped ${skillPath}`);
    const { text, document: skillDocument } = frontmatter(skill.bytes.toString("utf8"));
    if (skillDocument.has("allowed-tools")) {
      allowedTools = skillDocument.get("allowed-tools");
      // toJS returns plain values for a sequence or mapping instead of YAML nodes.
      const declared = skillDocument.get("allowed-tools", true);
      if (YAML.isNode(declared)) allowedTools = declared.toJSON();
      // A split keeps the spec byte-synced: its frontmatter is reference data,
      // not a skill a host loads, so only the request is recorded.
      if (!request.splitFront) {
        // Persist the removal as a sync-engine transform so replay matches byte for byte.
        document.addIn(["sources", sourceIndex, "artifacts", 0, "transforms"], document.createNode({
          kind: "replace-literal",
          path: FRONT,
          from: text,
          to: withoutKey(text, skillDocument, "allowed-tools"),
          minimum_occurrences: 1,
        }));
      }
    }
    if (request.licenseExpression === undefined) {
      const expression = skillDocument.get("license");
      if (typeof expression !== "string" || expression.length === 0) throw new Error("licenseExpression is required when upstream frontmatter has no license");
      document.setIn(["sources", sourceIndex, "license", "expression"], expression);
    }
    manifest = parseUpstreamManifest(document.toJS());
    artifact = manifest.sources[sourceIndex].artifacts[0];
    entries = [...transformSelection(selected, artifact).filter((entry) => entry.path !== licenseEntry.path), licenseEntry];
    if (request.splitFront) {
      const description = skillDocument.get("description");
      if (typeof description !== "string" || description.length === 0) {
        throw new Error("a split front needs an upstream description to seed it");
      }
      entries = [...entries, { path: FRONT, mode: "100644", bytes: Buffer.from(frontStub(request.id, description), "utf8") }];
    }
    document.setIn(["sources", sourceIndex, "artifacts", 0, "base_tree_digest"], digestTree(selected));
    document.setIn(["sources", sourceIndex, "artifacts", 0, "local_tree_digest"], digestTree(lockEntries(entries, artifact)));
  } else if (request.licenseExpression === undefined) {
    throw new Error("adapted imports require licenseExpression");
  }
  parseUpstreamManifest(document.toJS());
  if (!request.dryRun) {
    try {
      writeEntries(directory, entries);
      fs.writeFileSync(manifestPath, document.toString());
    } catch (error) {
      fs.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
  }
  return { allowedTools };
}
