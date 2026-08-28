import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import {
  checkOffline,
  digestTree,
  stableJson,
  transformSelection,
  updateArtifacts,
  type TreeEntry,
} from "../scripts/lib/upstream-sync";
import {
  ManifestError,
  loadUpstreamManifest,
  parseUpstreamManifest,
  validateManifestInventory,
  type UpstreamManifest,
} from "../scripts/lib/upstream-manifest";

const ROOT = path.resolve(import.meta.dir, "..");

function rawManifest(): Record<string, unknown> {
  return YAML.parse(fs.readFileSync(path.join(ROOT, "upstream.yaml"), "utf8")) as Record<string, unknown>;
}

function artifactAt(raw: Record<string, unknown>, index = 0): Record<string, unknown> {
  const sources = raw.sources as Record<string, unknown>[];
  return (sources[0].artifacts as Record<string, unknown>[])[index];
}

describe("upstream manifest boundary", () => {
  test("accepts the repository manifest and covers every canonical template", () => {
    const manifest = loadUpstreamManifest(ROOT);
    expect(() => validateManifestInventory(manifest, ROOT)).not.toThrow();
    expect(manifest.version).toBe(2);
    expect(manifest.skills).toHaveLength(51);
    expect(manifest.skills.filter((skill) => skill.origin === "adapted")).toHaveLength(9);
  });

  test("rejects unknown keys at nested boundaries", () => {
    const raw = rawManifest();
    (raw.policy as Record<string, unknown>).surprise = true;
    expect(() => parseUpstreamManifest(raw)).toThrow("manifest.policy: unknown key 'surprise'");
  });

  test("rejects missing required keys", () => {
    const raw = rawManifest();
    delete artifactAt(raw).checked_at;
    expect(() => parseUpstreamManifest(raw)).toThrow("missing key 'checked_at'");
  });

  test("rejects short SHAs", () => {
    const raw = rawManifest();
    artifactAt(raw).base_sha = "063bee9";
    expect(() => parseUpstreamManifest(raw)).toThrow("full lowercase 40-character SHA");
  });

  test.each([
    ["local_path", "../outside"],
    ["upstream_path", "/absolute/path"],
  ])("rejects unsafe %s values", (field, value) => {
    const raw = rawManifest();
    artifactAt(raw)[field] = value;
    expect(() => parseUpstreamManifest(raw)).toThrow(ManifestError);
  });

  test("rejects traversal in include patterns", () => {
    const raw = rawManifest();
    artifactAt(raw).include = ["SKILL.md", "../secrets/**"];
    expect(() => parseUpstreamManifest(raw)).toThrow("must not contain empty, '.' or '..' segments");
  });

  test("requires active lock fields as one coherent state", () => {
    const raw = rawManifest();
    artifactAt(raw).base_tree_digest = null;
    expect(() => parseUpstreamManifest(raw)).toThrow("active artifacts require non-null");
  });

  test("rejects credentials, local repositories, and option-like refs", () => {
    const credentialed = rawManifest();
    (credentialed.sources as Record<string, unknown>[])[0].repository = "https://token@example.com/repo.git";
    expect(() => parseUpstreamManifest(credentialed)).toThrow("must not embed credentials");

    const local = rawManifest();
    (local.sources as Record<string, unknown>[])[0].repository = "file:///tmp/repo";
    expect(() => parseUpstreamManifest(local)).toThrow("must use https");

    const unsafeRef = rawManifest();
    (unsafeRef.sources as Record<string, unknown>[])[0].ref = "--upload-pack=evil";
    expect(() => parseUpstreamManifest(unsafeRef)).toThrow("safe branch or tag name");
  });
});

describe("offline lock verification", () => {
  test("is byte-stable for identical inputs", () => {
    const manifest = loadUpstreamManifest(ROOT);
    const first = stableJson(checkOffline(ROOT, manifest));
    const second = stableJson(checkOffline(ROOT, manifest));
    expect(second).toBe(first);
  });

  test("fails closed on a local digest mismatch", () => {
    const raw = rawManifest();
    artifactAt(raw).local_tree_digest = `sha256:${"0".repeat(64)}`;
    const manifest = parseUpstreamManifest(raw);
    expect(() => checkOffline(ROOT, manifest)).toThrow("local tree digest does not match manifest");
  });

  test("fails closed on a patch digest mismatch", () => {
    const raw = rawManifest();
    artifactAt(raw).patch_digest = `sha256:${"0".repeat(64)}`;
    const manifest = parseUpstreamManifest(raw);
    expect(() => checkOffline(ROOT, manifest)).toThrow("patch digest does not match manifest");
  });

  test("rejects symlinks in canonical artifact content", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-sync-symlink-"));
    try {
      const local = path.join(temporary, "skills/coding/example");
      const patches = path.join(temporary, "upstream-patches/example");
      fs.mkdirSync(local, { recursive: true });
      fs.mkdirSync(patches, { recursive: true });
      fs.writeFileSync(path.join(temporary, "target"), "secret");
      fs.symlinkSync(path.join(temporary, "target"), path.join(local, "SKILL.md.tmpl"));
      fs.writeFileSync(path.join(patches, "local.patch"), "diff --git a/a b/a\n");

      const sha = "a".repeat(40);
      const digest = `sha256:${"b".repeat(64)}`;
      const manifest = parseUpstreamManifest({
        version: 2,
        policy: {
          maximum_file_bytes: 1024,
          maximum_artifact_bytes: 4096,
          allow_binary: false,
          allow_generated: false,
        },
        sources: [{
          id: "fixture",
          repository: "file:///fixture",
          ref: "main",
          license: { expression: "MIT", evidence: "SKILL.md" },
          artifacts: [{
            id: "example",
            upstream_path: "skills/example",
            local_path: "skills/coding/example",
            base_sha: sha,
            base_tree_digest: digest,
            local_tree_digest: digest,
            patch_digest: digest,
            checked_sha: sha,
            checked_at: "2026-08-28T00:00:00Z",
            candidate_sha: null,
            imported_at: "2026-08-28T00:00:00Z",
            include: ["SKILL.md"],
            exclude: [],
            path_map: { "SKILL.md": "SKILL.md.tmpl" },
            transforms: [
              { kind: "rename-skill", from: "fixture-skill", to: "example" },
              { kind: "inject-preamble", marker: "{{PREAMBLE}}" },
            ],
            patches: ["upstream-patches/example/local.patch"],
            status: "active",
          }],
        }],
        skills: [{
          local_path: "skills/coding/example",
          origin: "adapted",
          source_id: "fixture",
          upstream_path: "skills/example",
          evidence_sha: sha,
        }],
        external_records: [],
        not_vendored: {},
      }, { allowFileRepositories: true });
      expect(() => checkOffline(temporary, manifest)).toThrow("local artifact contains symlink");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  test("check mode does not modify repository status", () => {
    const output = path.join(os.tmpdir(), `trove-sync-report-${process.pid}.json`);
    const before = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).stdout;
    try {
      const result = spawnSync("bun", ["run", "sync:upstream", "--", "--check", "--offline", "--json", output], {
        cwd: ROOT,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(fs.readFileSync(output, "utf8")).mode).toBe("offline");
      const after = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).stdout;
      expect(after).toBe(before);
    } finally {
      fs.rmSync(output, { force: true });
    }
  });
});

type FixtureChange =
  | "add"
  | "edit"
  | "delete"
  | "rename"
  | "conflict"
  | "license"
  | "binary"
  | "generated"
  | "symlink"
  | "oversize";

interface UpdateFixture {
  root: string;
  upstream: string;
  manifest: UpstreamManifest;
  cleanup: () => void;
}

function runGit(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Trove Test",
      GIT_AUTHOR_EMAIL: "test@trove.invalid",
      GIT_COMMITTER_NAME: "Trove Test",
      GIT_COMMITTER_EMAIL: "test@trove.invalid",
      GIT_AUTHOR_DATE: "2026-08-28T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-08-28T00:00:00Z",
    },
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function writeEntryTree(directory: string, entries: readonly TreeEntry[]): void {
  for (const entry of entries) {
    const absolute = path.join(directory, entry.path);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, entry.bytes, { mode: entry.mode === "100755" ? 0o755 : 0o644 });
  }
}

function createPatch(before: readonly TreeEntry[], after: readonly TreeEntry[]): string {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-patch-fixture-"));
  try {
    writeEntryTree(path.join(temporary, "base"), before);
    writeEntryTree(path.join(temporary, "local"), after);
    const result = spawnSync("git", ["diff", "--no-index", "--binary", "base", "local"], {
      cwd: temporary,
      encoding: "utf8",
    });
    if (result.status !== 1) throw new Error(result.stderr || "fixture patch was unexpectedly empty");
    return result.stdout.replaceAll("a/base/", "a/").replaceAll("b/local/", "b/");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function fixtureRaw(repository: string, maximumFileBytes: number): Record<string, unknown> {
  const sha = "a".repeat(40);
  const digest = `sha256:${"b".repeat(64)}`;
  return {
    version: 2,
    policy: {
      maximum_file_bytes: maximumFileBytes,
      maximum_artifact_bytes: 8192,
      allow_binary: false,
      allow_generated: false,
    },
    sources: [{
      id: "fixture-source",
      repository,
      ref: "main",
      license: { expression: "MIT", evidence: "skills/example/SKILL.md" },
      artifacts: [{
        id: "trove-example",
        upstream_path: "skills/example",
        local_path: "skills/coding/trove-example",
        base_sha: sha,
        base_tree_digest: digest,
        local_tree_digest: digest,
        patch_digest: digest,
        checked_sha: sha,
        checked_at: "2026-08-28T00:00:00Z",
        candidate_sha: null,
        imported_at: "2026-08-28T00:00:00Z",
        include: ["SKILL.md", "rules/**"],
        exclude: [],
        path_map: { "SKILL.md": "SKILL.md.tmpl", "rules/": "references/" },
        transforms: [
          { kind: "rename-skill", from: "fixture-skill", to: "trove-example" },
          { kind: "inject-preamble", marker: "{{PREAMBLE}}" },
        ],
        patches: ["upstream-patches/trove-example/local.patch"],
        status: "active",
      }],
    }],
    skills: [{
      local_path: "skills/coding/trove-example",
      origin: "adapted",
      source_id: "fixture-source",
      upstream_path: "skills/example",
      evidence_sha: sha,
    }],
    external_records: [],
    not_vendored: {},
  };
}

function createUpdateFixture(change: FixtureChange): UpdateFixture {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `trove-update-${change}-`));
  const upstream = path.join(temporary, "upstream");
  const root = path.join(temporary, "root");
  fs.mkdirSync(path.join(upstream, "skills/example/rules"), { recursive: true });
  fs.writeFileSync(
    path.join(upstream, "skills/example/SKILL.md"),
    "---\nname: fixture-skill\ndescription: fixture\nlicense: MIT\n---\n\n# Fixture\n",
  );
  fs.writeFileSync(
    path.join(upstream, "skills/example/rules/a.md"),
    "upstream one\nstable two\nstable three\nstable four\nstable five\nstable six\nstable seven\nlocal target\n",
  );
  runGit(upstream, ["init", "-q", "-b", "main"]);
  runGit(upstream, ["add", "."]);
  runGit(upstream, ["commit", "-q", "-m", "base"]);
  const baseSha = runGit(upstream, ["rev-parse", "HEAD"]);

  fs.mkdirSync(root, { recursive: true });
  const raw = fixtureRaw(pathToFileURL(upstream).href, change === "oversize" ? 256 : 4096);
  const rawArtifact = ((raw.sources as Record<string, unknown>[])[0].artifacts as Record<string, unknown>[])[0];
  rawArtifact.base_sha = baseSha;
  rawArtifact.checked_sha = baseSha;
  (raw.skills as Record<string, unknown>[])[0].evidence_sha = baseSha;
  let manifest = parseUpstreamManifest(raw, { allowFileRepositories: true });
  const artifact = manifest.sources[0].artifacts[0];
  const base: TreeEntry[] = [
    {
      path: "SKILL.md",
      mode: "100644",
      bytes: fs.readFileSync(path.join(upstream, "skills/example/SKILL.md")),
    },
    {
      path: "rules/a.md",
      mode: "100644",
      bytes: fs.readFileSync(path.join(upstream, "skills/example/rules/a.md")),
    },
  ];
  const transformed = transformSelection(base, artifact);
  const local = transformed.map((entry) => ({
    ...entry,
    bytes: entry.path === "references/a.md"
      ? Buffer.from(entry.bytes.toString("utf8").replace("local target", "local override"))
      : entry.bytes,
  }));
  writeEntryTree(path.join(root, "skills/coding/trove-example"), local);
  const patchPath = "upstream-patches/trove-example/local.patch";
  const patch = Buffer.from(createPatch(transformed, local));
  fs.mkdirSync(path.join(root, path.dirname(patchPath)), { recursive: true });
  fs.writeFileSync(path.join(root, patchPath), patch);
  rawArtifact.base_tree_digest = digestTree(base);
  rawArtifact.local_tree_digest = digestTree(local);
  rawArtifact.patch_digest = digestTree([{ path: patchPath, mode: "100644", bytes: patch }]);

  const rules = path.join(upstream, "skills/example/rules");
  if (change === "add") fs.writeFileSync(path.join(rules, "b.md"), "new upstream file\n");
  if (change === "edit") {
    fs.writeFileSync(
      path.join(rules, "a.md"),
      "upstream changed\nstable two\nstable three\nstable four\nstable five\nstable six\nstable seven\nlocal target\n",
    );
  }
  if (change === "delete") fs.rmSync(path.join(rules, "a.md"));
  if (change === "rename") fs.renameSync(path.join(rules, "a.md"), path.join(rules, "renamed.md"));
  if (change === "conflict") {
    fs.writeFileSync(
      path.join(rules, "a.md"),
      "upstream one\nstable two\nstable three\nstable four\nstable five\nstable six\nstable seven\nupstream override\n",
    );
  }
  if (change === "license") {
    fs.writeFileSync(
      path.join(upstream, "skills/example/SKILL.md"),
      "---\nname: fixture-skill\ndescription: fixture\nlicense: Apache-2.0\n---\n\n# Fixture\n",
    );
  }
  if (change === "binary") fs.writeFileSync(path.join(rules, "binary.dat"), Buffer.from([0, 1, 2]));
  if (change === "generated") fs.writeFileSync(path.join(rules, "generated.md"), "<!-- @generated -->\n");
  if (change === "symlink") fs.symlinkSync("a.md", path.join(rules, "link.md"));
  if (change === "oversize") fs.writeFileSync(path.join(rules, "large.md"), "x".repeat(512));
  runGit(upstream, ["add", "-A"]);
  runGit(upstream, ["commit", "-q", "-m", change]);

  fs.writeFileSync(path.join(root, "upstream.yaml"), YAML.stringify(raw, { lineWidth: 0 }));
  runGit(root, ["init", "-q", "-b", "main"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-q", "-m", "fixture"]);
  manifest = loadUpstreamManifest(root, "upstream.yaml", { allowFileRepositories: true });
  return {
    root,
    upstream,
    manifest,
    cleanup: () => fs.rmSync(temporary, { recursive: true, force: true }),
  };
}

describe("one-artifact updater", () => {
  test("applies an upstream-only addition and is idempotent after acceptance", () => {
    const fixture = createUpdateFixture("add");
    try {
      const first = updateArtifacts(fixture.root, fixture.manifest, { artifactId: "trove-example" }, {
        verify: () => ["fixture verification"],
      });
      expect(first.artifacts[0].conclusion).toBe("updated");
      expect(first.artifacts[0].changed_paths).toEqual(["rules/b.md"]);
      expect(fs.readFileSync(path.join(fixture.root, "skills/coding/trove-example/references/b.md"), "utf8"))
        .toBe("new upstream file\n");
      expect(fs.readFileSync(path.join(fixture.root, "skills/coding/trove-example/references/a.md"), "utf8"))
        .toContain("local override");

      runGit(fixture.root, ["add", "-A"]);
      runGit(fixture.root, ["commit", "-q", "-m", "accept update"]);
      const second = updateArtifacts(
        fixture.root,
        loadUpstreamManifest(fixture.root, "upstream.yaml", { allowFileRepositories: true }),
        { artifactId: "trove-example" },
        {
          verify: () => ["fixture verification"],
        },
      );
      expect(second.artifacts[0].conclusion).toBe("no-changes");
      expect(runGit(fixture.root, ["status", "--porcelain"])).toBe("");
    } finally {
      fixture.cleanup();
    }
  });

  test("applies a non-overlapping upstream edit", () => {
    const fixture = createUpdateFixture("edit");
    try {
      const report = updateArtifacts(fixture.root, fixture.manifest, { sourceId: "fixture-source" }, {
        verify: () => ["fixture verification"],
      });
      expect(report.artifacts[0].conclusion).toBe("updated");
      const content = fs.readFileSync(path.join(fixture.root, "skills/coding/trove-example/references/a.md"), "utf8");
      expect(content).toContain("upstream changed");
      expect(content).toContain("local override");
    } finally {
      fixture.cleanup();
    }
  });

  test.each([
    ["delete", "conflict"],
    ["rename", "conflict"],
    ["conflict", "conflict"],
    ["license", "license-changed"],
    ["binary", "validation-failed"],
    ["generated", "validation-failed"],
    ["symlink", "validation-failed"],
    ["oversize", "validation-failed"],
  ] as const)("reports %s without touching the source", (change, conclusion) => {
    const fixture = createUpdateFixture(change);
    try {
      const before = runGit(fixture.root, ["status", "--porcelain"]);
      const report = updateArtifacts(fixture.root, fixture.manifest, { artifactId: "trove-example" }, {
        verify: () => ["fixture verification"],
      });
      expect(report.artifacts[0].conclusion).toBe(conclusion);
      expect(runGit(fixture.root, ["status", "--porcelain"])).toBe(before);
      expect(fs.readFileSync(path.join(fixture.root, "skills/coding/trove-example/references/a.md"), "utf8"))
        .toContain("local override");
    } finally {
      fixture.cleanup();
    }
  });

  test("rolls back the entire worktree when verification fails", () => {
    const fixture = createUpdateFixture("add");
    try {
      const report = updateArtifacts(fixture.root, fixture.manifest, { artifactId: "trove-example" }, {
        verify: () => { throw new Error("fixture verifier failed"); },
      });
      expect(report.artifacts[0].conclusion).toBe("validation-failed");
      expect(runGit(fixture.root, ["status", "--porcelain"])).toBe("");
      expect(fs.existsSync(path.join(fixture.root, "skills/coding/trove-example/references/b.md"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });
});

describe("upstream workflow policy", () => {
  const workflow = YAML.parse(
    fs.readFileSync(path.join(ROOT, ".github/workflows/upstream-sync.yml"), "utf8"),
  ) as Record<string, unknown>;
  const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
  const check = jobs.check;
  const update = jobs.update;

  test("pins every action to a full commit SHA", () => {
    for (const job of Object.values(jobs)) {
      for (const step of job.steps as Record<string, unknown>[]) {
        if (typeof step.uses !== "string") continue;
        expect(step.uses).toMatch(/^[^@]+@[0-9a-f]{40}$/);
      }
    }
  });

  test("keeps the scheduled checker read-only and model-free", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(check.permissions).toEqual({ contents: "read" });
    expect(check["timeout-minutes"]).toBe(30);
    expect(JSON.stringify(check)).not.toContain("CLAUDE");
    expect(JSON.stringify(check)).not.toContain("id-token");
    const commands = (check.steps as Record<string, unknown>[])
      .map((step) => step.run)
      .filter((run): run is string => typeof run === "string")
      .join("\n");
    expect(commands).toContain("bun ci");
    expect(commands.indexOf("bun run build")).toBeLessThan(commands.indexOf("--check"));
    expect(commands.indexOf("bun test")).toBeLessThan(commands.indexOf("--check"));
    expect(commands.indexOf("bun run validate")).toBeLessThan(commands.indexOf("--check"));
  });

  test("gates one-artifact write mode and grants no OIDC permission", () => {
    expect(update.if).toContain("UPSTREAM_SYNC_WRITES_ENABLED");
    expect(update.permissions).toEqual({ contents: "write", "pull-requests": "write" });
    expect(JSON.stringify(update.permissions)).not.toContain("id-token");
    expect(update["timeout-minutes"]).toBe(45);
    const serialized = JSON.stringify(update);
    expect(serialized).toContain("--update \\\"$ARTIFACT\\\"");
    expect(serialized).not.toContain("--update-source");
    expect(serialized).toContain("gh pr create");
    expect(serialized).toContain("gh pr list");
    expect(JSON.stringify(workflow.concurrency)).toContain("upstream-sync-update");
    expect(JSON.stringify(workflow.concurrency)).not.toContain("inputs.artifact");
  });
});
