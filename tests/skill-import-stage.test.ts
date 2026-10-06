import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { stageImport } from "../scripts/lib/skill-import/stage";
import { loadUpstreamManifest } from "../scripts/lib/upstream-manifest";
import { checkOffline, digestTree, lockEntries, readGitSelection, transformSelection, walkLocal } from "../scripts/lib/upstream-sync";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function snapshot(directory: string, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (item.name === ".git") continue;
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) Object.assign(files, snapshot(absolute, relative));
    else files[relative] = fs.readFileSync(absolute).toString("base64");
  }
  return files;
}

const DEFAULT_SKILL = "---\nname: example\ndescription: A fixture skill\nlicense: MIT\nallowed-tools:\n  - Bash\n  - Read\n---\n\n# example\n\nUse ORIGINAL.\n";

function fixture(skill = DEFAULT_SKILL) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-stage-"));
  temporaryDirectories.push(temporary);
  const root = path.join(temporary, "target");
  const upstream = path.join(temporary, "upstream");
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(upstream, "example", "notes"), { recursive: true });
  fs.writeFileSync(path.join(upstream, "LICENSE"), "MIT License\n\nCopyright fixture\n");
  fs.writeFileSync(path.join(upstream, "example", "SKILL.md"), skill);
  fs.writeFileSync(path.join(upstream, "example", "notes", "guide.md"), "fixture reference\n");
  fs.writeFileSync(path.join(upstream, "example", "ignored.md"), "excluded\n");
  git(upstream, "init", "--quiet");
  git(upstream, "add", ".");
  git(upstream, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--quiet", "-m", "fixture");
  const sha = git(upstream, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(root, "upstream.yaml"), "# Keep the manifest header\nversion: 2\npolicy:\n  maximum_file_bytes: 262144 # Keep the inline comment\n  maximum_artifact_bytes: 4194304\n  allow_binary: false\n  allow_generated: false\n# Keep the source explanation\nsources: []\nskills: []\nexternal_records: []\nnot_vendored: {}\n");
  git(root, "init", "--quiet");
  git(root, "add", ".");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--quiet", "-m", "fixture");
  const request = {
    root,
    mode: "vendored" as const,
    id: "trove-example",
    plugin: "trove-dev",
    category: "coding",
    upstreamPath: "example",
    licenseExpression: "MIT",
    selection: { include: ["SKILL.md", "notes/**"], exclude: ["ignored.md"], pathMap: { "SKILL.md": "SKILL.md.tmpl", "notes/": "references/" } },
    report: {
      mode: "vendored" as const,
      source: { repository: "https://github.com/fixture/skills.git", resolvedSha: sha, gitDirectory: path.join(upstream, ".git"), cleanup: async () => {} },
      findings: [],
      proposedTransforms: [{ kind: "replace-literal" as const, path: "SKILL.md.tmpl", from: "ORIGINAL", to: "UNACCEPTED", minimumOccurrences: 1 }],
    },
    renameSkill: { from: "example", to: "trove-example" },
    preambleMarker: "{{PREAMBLE}}",
    acceptedTransforms: [{ kind: "replace-literal" as const, path: "SKILL.md.tmpl", from: "ORIGINAL", to: "ACCEPTED", minimumOccurrences: 1 }],
    dryRun: false,
  };
  return { root, upstream, sha, request };
}

describe("skill import staging", () => {
  test("vendors selected blobs with replayable transforms and matching offline locks", async () => {
    const { root, upstream, request, sha } = fixture();
    const result = await stageImport(request);
    const manifest = loadUpstreamManifest(root);
    const artifact = manifest.sources[0].artifacts[0];
    expect(artifact.baseSha).toBe(sha);
    expect(manifest.skills[0]).toMatchObject({ origin: "adapted", sourceId: "trove-example", upstreamPaths: ["example"], evidenceSha: sha });
    const base = readGitSelection(path.join(upstream, ".git"), artifact.checkedSha, artifact, manifest);
    expect(artifact.baseTreeDigest).toBe(digestTree(base));
    const directory = path.join(root, artifact.localPath);
    expect(artifact.localTreeDigest).toBe(digestTree(lockEntries(walkLocal(directory), artifact)));
    expect(artifact.patchDigest).toBe(digestTree([]));
    expect(digestTree(lockEntries(transformSelection(base, artifact), artifact))).toBe(artifact.localTreeDigest);
    expect(checkOffline(root, manifest).artifacts[0]).toMatchObject({ conclusion: "no-changes", patch: { digest: "verified" } });
    const content = fs.readFileSync(path.join(directory, "SKILL.md.tmpl"), "utf8");
    expect(content).toContain("name: trove-example");
    expect(content).toContain("{{PREAMBLE}}");
    expect(content).toContain("Use ACCEPTED.");
    expect(content).not.toContain("allowed-tools");
    expect(result).toEqual({ allowedTools: ["Bash", "Read"] });
    expect(fs.readFileSync(path.join(directory, "references/LICENSE.md"), "utf8")).toBe(fs.readFileSync(path.join(upstream, "LICENSE"), "utf8"));
    expect(fs.existsSync(path.join(directory, "references/guide.md"))).toBe(true);
    expect(fs.existsSync(path.join(directory, "ignored.md"))).toBe(false);
    expect(fs.existsSync(path.join(directory, "SKILL.md"))).toBe(false);
  });

  test.each(["vendored", "adapted"] as const)("dryRun in %s mode preserves git status and every file byte", async (mode) => {
    const { root, request } = fixture();
    const beforeStatus = git(root, "status", "--porcelain=v1", "--untracked-files=all");
    const before = snapshot(root);
    await stageImport({ ...request, mode, report: { ...request.report, mode }, dryRun: true });
    expect(git(root, "status", "--porcelain=v1", "--untracked-files=all")).toBe(beforeStatus);
    expect(snapshot(root)).toEqual(before);
  });

  test("adapted mode records evidence and copies only the license", async () => {
    const { root, upstream, sha, request } = fixture();
    await stageImport({ ...request, mode: "adapted", report: { ...request.report, mode: "adapted" } });
    const manifest = loadUpstreamManifest(root);
    expect(manifest.sources[0].artifacts).toEqual([]);
    expect(manifest.skills[0]).toMatchObject({ origin: "adapted", sourceId: "trove-example", evidenceSha: sha });
    const directory = path.join(root, "skills/coding/trove-example");
    expect(snapshot(directory)).toEqual({ "references/LICENSE.md": fs.readFileSync(path.join(upstream, "LICENSE")).toString("base64") });
  });

  test("infers a vendored license from frontmatter when no expression is supplied", async () => {
    const { root, request } = fixture();
    await stageImport({ ...request, licenseExpression: undefined, renameSkill: undefined, preambleMarker: undefined, acceptedTransforms: undefined });
    const manifest = loadUpstreamManifest(root);
    expect(manifest.sources[0].license.expression).toBe("MIT");
    expect(checkOffline(root, manifest).artifacts[0].conclusion).toBe("no-changes");
  });

  test("rejects hard findings without writing files", async () => {
    const { root, request } = fixture();
    const before = snapshot(root);
    await expect(stageImport({ ...request, report: { ...request.report, findings: [{ severity: "hard-reject", file: "SKILL.md", line: 1, message: "unsafe source" }] } })).rejects.toThrow("hard-reject");
    expect(snapshot(root)).toEqual(before);
  });

  test("rejects missing licenses without leaving a partial skill or manifest edit", async () => {
    const { root, request } = fixture();
    const before = snapshot(root);
    await expect(stageImport({ ...request, licensePath: "MISSING" })).rejects.toThrow("cannot read upstream license");
    expect(snapshot(root)).toEqual(before);
  });

  test("refuses to overwrite an existing skill", async () => {
    const { root, request } = fixture();
    const directory = path.join(root, "skills/coding/trove-example");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "SKILL.md.tmpl"), "existing author content\n");
    const before = snapshot(root);
    await expect(stageImport(request)).rejects.toThrow("skill directory already exists");
    expect(snapshot(root)).toEqual(before);
  });

  test("removes only allowed-tools and leaves the rest of the frontmatter byte-identical", async () => {
    const description = "Use this skill whenever the user mentions a video or audio file, even when they do not say edit, convert, or transcode.";
    const { root, request } = fixture(
      `---\nname: example\ndescription: ${description}\nallowed-tools: Bash, Read\nlicense: MIT # upstream notice\nmetadata: {version: "1.2"}\n---\n\n# example\n\nUse ORIGINAL.\n`,
    );
    const result = await stageImport({ ...request, renameSkill: undefined, preambleMarker: undefined, acceptedTransforms: undefined });
    const content = fs.readFileSync(path.join(root, "skills/coding/trove-example/SKILL.md.tmpl"), "utf8");
    expect(content).toStartWith(`---\nname: example\ndescription: ${description}\nlicense: MIT # upstream notice\nmetadata: {version: "1.2"}\n---\n`);
    expect(result).toEqual({ allowedTools: "Bash, Read" });
    expect(checkOffline(root, loadUpstreamManifest(root)).artifacts[0].conclusion).toBe("no-changes");
  });

  test("a split front byte-syncs upstream SKILL.md as the runtime spec and stages a local_only front", async () => {
    const { root, upstream, request } = fixture();
    const result = await stageImport({
      ...request,
      splitFront: true,
      renameSkill: undefined,
      preambleMarker: undefined,
      acceptedTransforms: undefined,
      selection: { ...request.selection, pathMap: { "notes/": "references/" } },
    });
    const manifest = loadUpstreamManifest(root);
    const artifact = manifest.sources[0].artifacts[0];
    expect(artifact.pathMap["SKILL.md"]).toBe("references/runtime-spec.md");
    expect(artifact.localOnly).toContain("SKILL.md.tmpl");
    const directory = path.join(root, artifact.localPath);
    expect(fs.readFileSync(path.join(directory, "references/runtime-spec.md"), "utf8"))
      .toBe(fs.readFileSync(path.join(upstream, "example", "SKILL.md"), "utf8"));
    const front = fs.readFileSync(path.join(directory, "SKILL.md.tmpl"), "utf8");
    expect(front).toContain("name: trove-example");
    expect(front).toContain("{{PREAMBLE}}");
    expect(front).toContain("references/runtime-spec.md");
    expect(result).toEqual({ allowedTools: ["Bash", "Read"] });
    expect(checkOffline(root, manifest).artifacts[0]).toMatchObject({ conclusion: "no-changes", patch: { digest: "verified" } });
  });

  test("a split front refuses rename and preamble transforms", async () => {
    const { root, request } = fixture();
    const before = snapshot(root);
    await expect(stageImport({ ...request, splitFront: true })).rejects.toThrow("split front");
    expect(snapshot(root)).toEqual(before);
  });

  test("preserves existing comments and top-level key order", async () => {
    const { root, request } = fixture();
    await stageImport(request);
    const content = fs.readFileSync(path.join(root, "upstream.yaml"), "utf8");
    expect(content).toContain("# Keep the manifest header");
    expect(content).toContain("# Keep the inline comment");
    expect(content).toContain("# Keep the source explanation");
    expect(Object.keys(YAML.parse(content))).toEqual(["version", "policy", "sources", "skills", "external_records", "not_vendored"]);
  });
});
