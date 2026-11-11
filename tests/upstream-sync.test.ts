import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { maintainedSkills } from "../scripts/lib/eval-structure";
import {
  checkOffline,
  digestTree,
  renderMarkdown,
  isCanonicalArtifactPath,
  lockEntries,
  patchEntries,
  readGitSelection,
  stableJson,
  transformSelection,
  updateArtifacts,
  walkLocal,
  writeEntries,
  type TreeEntry,
} from "../scripts/lib/upstream-sync";
import {
  ManifestError,
  effectivePolicy,
  type LicenseRecord,
  loadUpstreamManifest,
  parseUpstreamManifest,
  validateManifestInventory,
  type UpstreamManifest,
  type FullSha,
} from "../scripts/lib/upstream-manifest";

const ROOT = path.resolve(import.meta.dir, "..");

function rawManifest(): Record<string, unknown> {
  return YAML.parse(fs.readFileSync(path.join(ROOT, "upstream.yaml"), "utf8")) as Record<string, unknown>;
}

function artifactRecord(sha: string, upstreamPath: string, include: readonly string[], localPath: string): Record<string, unknown> {
  const digest = `sha256:${"b".repeat(64)}`;
  return {
    id: localPath.replaceAll("/", "-"),
    upstream_path: upstreamPath,
    local_path: localPath,
    base_sha: sha,
    base_tree_digest: digest,
    local_tree_digest: digest,
    patch_digest: digest,
    checked_sha: sha,
    checked_at: "2026-08-28T00:00:00Z",
    candidate_sha: null,
    imported_at: "2026-08-28T00:00:00Z",
    include,
    exclude: [],
    path_map: {},
    transforms: [],
    patches: [],
    status: "active",
  };
}

function skillRecord(sha: string, upstreamPath: string, localPath: string): Record<string, unknown> {
  return { local_path: localPath, origin: "adapted", source_id: "fixture", upstream_path: upstreamPath, evidence_sha: sha };
}

function artifactAt(raw: Record<string, unknown>, index = 0): Record<string, unknown> {
  const sources = raw.sources as Record<string, unknown>[];
  return (sources[0].artifacts as Record<string, unknown>[])[index];
}

function parseFrontmatter(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`no frontmatter in ${filePath}`);
  return YAML.parse(match[1]) as Record<string, unknown>;
}

describe("upstream manifest boundary", () => {
  test("accepts the repository manifest and covers every canonical template", () => {
    const manifest = loadUpstreamManifest(ROOT);
    expect(() => validateManifestInventory(manifest, ROOT)).not.toThrow();
    expect(manifest.version).toBe(2);
    // Derived from the catalog so adopting a skill does not require editing a
    // count here; validateManifestInventory already proves the two agree.
    expect(manifest.skills).toHaveLength(maintainedSkills(ROOT).length);
    for (const skill of manifest.skills) {
      if (skill.origin === "adapted") {
        expect(manifest.sources.some((source) => source.id === skill.sourceId)).toBe(true);
      }
    }
  });

  test("scopes the English pulse slash-command rewrite to backtick form", () => {
    const manifest = loadUpstreamManifest(ROOT);
    const pulse = manifest.sources.flatMap((source) => [...source.artifacts])
      .find((artifact) => artifact.id === "trove-pulse");
    expect(pulse).toBeDefined();
    expect(pulse!.localOnly).toEqual(["SKILL.md.tmpl"]);
    // The patch carries Trove's own edits beyond the transforms: the setup
    // wizard no longer describes the excluded browser-cookie lanes, and
    // BROWSER_CDP_URL is dropped from the research keys.
    expect(pulse!.patches).toEqual(["upstream-patches/trove-pulse/local.patch"]);
    // The rewrite moved from the spec to every reference that still quotes the
    // slash command. Assert the scope, not the file list, so a new reference
    // does not silently widen it.
    const rewrites = pulse!.transforms.filter((transform) => transform.kind === "replace-literal");
    expect(rewrites.length).toBeGreaterThan(0);
    expect(new Set(rewrites.map((transform) => `${transform.from} -> ${transform.to}`))).toEqual(
      new Set([
        "`/last30days -> `/trove-research:trove-pulse",
        "/last30days -  -> /trove-research:trove-pulse - ",
        "with /last30days  -> with /trove-research:trove-pulse ",
      ]),
    );
    expect(rewrites.every((transform) => transform.path.startsWith("references/") || transform.path.startsWith("scripts/"))).toBe(true);
  });

  test("records matching metadata.upstream-version for pulse artifacts", () => {
    const pulse = parseFrontmatter(path.join(ROOT, "skills/research/trove-pulse/SKILL.md.tmpl"));
    const spec = parseFrontmatter(path.join(ROOT, "skills/research/trove-pulse/references/runtime-spec.md"));
    // The wrapper records the release it was written against. The vendored
    // spec moves with the upstream pin, so the two versions diverge by design.
    expect((pulse.metadata as Record<string, string>)["upstream-version"]).toBe("3.21.1");
    expect(spec.version).toBe("3.33.0");

    const cn = parseFrontmatter(path.join(ROOT, "skills/research/trove-pulse-cn/SKILL.md.tmpl"));
    expect((cn.metadata as Record<string, string>)["upstream-version"]).toBe(cn.version);
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

  test("accepts a repository root upstream path and rejects traversal", () => {
    const raw = rawManifest();
    const source = (raw.sources as Record<string, unknown>[])[0];
    raw.sources = [source];
    raw.not_vendored = {};
    source.artifacts = [artifactAt(raw)];
    artifactAt(raw).upstream_path = ".";
    raw.skills = [{ local_path: artifactAt(raw).local_path, origin: "adapted", source_id: source.id, upstream_path: ".", evidence_sha: "a".repeat(40) }];
    expect(parseUpstreamManifest(raw).sources[0].artifacts[0].upstreamPath).toBe(".");

    artifactAt(raw).upstream_path = "./skills";
    expect(() => parseUpstreamManifest(raw)).toThrow("must not contain empty, '.' or '..' segments");
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

  test("rejects calendar-invalid timestamps", () => {
    const raw = rawManifest();
    artifactAt(raw).checked_at = "2026-02-31T00:00:00Z";
    expect(() => parseUpstreamManifest(raw)).toThrow("must be a real calendar date");
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

  test("pulse-cn project config cannot grant its own trust", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-pulse-cn-trust-"));
    const config = fs.mkdtempSync(path.join(os.tmpdir(), "trove-pulse-cn-home-"));
    const project = path.join(temporary, ".claude");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, "last30days-cn.env"), [
      "LAST30DAYS_TRUST_PROJECT_CONFIG=true",
      "GITHUB_TOKEN=fixture",
      "LAST30DAYS_UPSTREAM=/tmp/not-an-upstream",
    ].join("\n"));
    const script = `
import os, sys
sys.path.insert(0, sys.argv[1])
os.chdir(sys.argv[2])
import io
from lib import crawler_bridge, env, hot_board, http, upstream_bridge
crawler_bridge.COOKIE_DIR = __import__("pathlib").Path(sys.argv[3])
config = env.get_config()
print("TOKEN_PRESENT=" + str(bool(config.get("GITHUB_TOKEN"))))
print("SOURCE=" + str(config.get("_CONFIG_SOURCE")))
print("UPSTREAM=" + str(upstream_bridge.find_upstream()))
print("PYTHON=" + str(upstream_bridge.upstream_python()[0]))
kept = crawler_bridge.import_cookie_header("zhihu", "z_c0=login; session=other")
print("COOKIE_NAMES=" + str(kept))
page = hot_board.render_page({"boards": {}, "generated_at": "2026-11-10"}, 1, 1, "test", str, lambda url: url)
print("SPRITE_EMBEDDED=" + str("data:image/png;base64" in page))
first = http.urllib.request.Request("http://one.test/start", headers={"Authorization": "secret", "Cookie": "a=b"})
error = http.urllib.error.HTTPError("http://one.test/start", 302, "Found", {"Location": "http://two.test/next"}, None)
redirected = http._StripAuthOnCrossOriginRedirect().redirect_request(first, None, error.code, error.msg, error.headers, "http://two.test/next")
names = {name.lower() for name in redirected.header_items()}
print("AUTH=" + str("authorization" in names))
print("COOKIE=" + str("cookie" in names))
`;
    const cookies = fs.mkdtempSync(path.join(os.tmpdir(), "trove-pulse-cn-cookies-"));
    const run = (extra: Record<string, string>) => spawnSync("python3", ["-I", "-c", script,
      path.join(ROOT, "skills/research/trove-pulse-cn/scripts"), temporary, cookies], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        LAST30DAYS_CN_CONFIG_DIR: config,
        ...extra,
      },
    });
    try {
      const untrusted = run({});
      expect(untrusted.status).toBe(0);
      expect(untrusted.stdout).toContain("TOKEN_PRESENT=False");
      expect(untrusted.stdout).toContain("UPSTREAM=None");

      const trusted = run({ LAST30DAYS_TRUST_PROJECT_CONFIG: "true" });
      expect(trusted.status).toBe(0);
      expect(trusted.stdout).toContain("TOKEN_PRESENT=True");
      expect(trusted.stdout).toContain("SOURCE=project:");

      const relative = run({
        LAST30DAYS_TRUST_PROJECT_CONFIG: "true",
        LAST30DAYS_UPSTREAM_PYTHON: "python3",
      });
      expect(relative.status).toBe(0);
      expect(relative.stdout).toContain("PYTHON=None");
      expect(relative.stdout).toContain("COOKIE_NAMES=1");
      expect(relative.stdout).toContain("SPRITE_EMBEDDED=False");
      expect(relative.stdout).toContain("AUTH=False");
      expect(relative.stdout).toContain("COOKIE=False");
      const saved = JSON.parse(fs.readFileSync(path.join(cookies, "zhihu_cookies.json"), "utf8")) as { name: string }[];
      expect(saved.map((cookie) => cookie.name)).toEqual(["z_c0"]);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
      fs.rmSync(config, { recursive: true, force: true });
      fs.rmSync(cookies, { recursive: true, force: true });
    }
  });

  test("pulse report files are owner-only and a failed grok audit does not launch", () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "trove-pulse-runtime-"));
    const script = `
import os, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from lib import render, schema
os.environ["LAST30DAYS_OUTPUT_DIR"] = sys.argv[3]
report = schema.Report(
    topic="fixture",
    range_from="2026-10-11",
    range_to="2026-11-10",
    generated_at="2026-11-10T00:00:00Z",
    mode="research",
)
render.write_outputs(report)
private = 0
for name in ("report.json", "report.md", "report.html", "last30days.context.md"):
    if Path(sys.argv[3], name).stat().st_mode & 0o077:
        print("LEAK=" + name)
    else:
        private += 1
print("REPORT_PRIVATE=" + str(private))
sys.path.insert(0, sys.argv[2])
for name in list(sys.modules):
    if name == "lib" or name.startswith("lib."):
        del sys.modules[name]
from lib import grok_audit, grok_x
launched = []
class Done:
    returncode = 0
    stdout = "{}"
    stderr = ""
def fake_run(argv, **kwargs):
    launched.append(list(argv))
    return Done()
grok_x.binary_path = lambda: "/tmp/fake-grok"
grok_x._check_cli_version = lambda binary, workdir, timeout: (None, "grok 1.0.99")
grok_x._stage_child_home = lambda workdir: workdir
grok_x.subprocess.run = fake_run
grok_audit.resolve_native = lambda binary, timeout: "/tmp/fake-grok"
for status in (grok_audit.FAIL, grok_audit.INCONCLUSIVE, grok_audit.PASS):
    launched.clear()
    grok_audit.verdict_for = lambda binary, version, deadline, status=status: grok_audit.Verdict(status, "fixture")
    result = grok_x._invoke("topic", 5)
    print("GROK_" + status.upper() + "=" + ("LAUNCHED" if launched else "STOPPED"))
    if status == grok_audit.PASS:
        print("GROK_PASS_BYPASS=" + str(any("bypassPermissions" in str(arg) for arg in launched)))
    else:
        print("GROK_" + status.upper() + "_GATE=" + str("tool-boundary audit" in str(result.get("error", ""))))
`;
    const run = spawnSync("python3", ["-I", "-c", script,
      path.join(ROOT, "skills/research/trove-pulse-cn/scripts"),
      path.join(ROOT, "skills/research/trove-pulse/scripts"),
      output,
    ], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
    });
    try {
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("REPORT_PRIVATE=4");
      expect(run.stdout).not.toContain("LEAK=");
      expect(run.stdout).toContain("GROK_FAIL=STOPPED");
      expect(run.stdout).toContain("GROK_FAIL_GATE=True");
      expect(run.stdout).toContain("GROK_INCONCLUSIVE=STOPPED");
      expect(run.stdout).toContain("GROK_INCONCLUSIVE_GATE=True");
      expect(run.stdout).toContain("GROK_PASS=LAUNCHED");
      expect(run.stdout).toContain("GROK_PASS_BYPASS=True");
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });

  test("pulse hacker news filter reads the submission body and requires the topic's longest word", () => {
    const script = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
from lib import hackernews

def hit(object_id, title, body=None):
    return {"objectID": object_id, "title": title, "story_text": body, "points": 40,
            "num_comments": 3, "created_at_i": 1793000000, "author": "someone"}

response = {"hits": [
    hit("1", "Remotion 5 released"),
    hit("2", "Ask HN: How do you render product demos?", "We script ours with Remotion and it works."),
    hit("3", "Show HN: A video editor written in React"),
    hit("4", "Removing relationship reactions from our app"),
]}
multi = hackernews.parse_hackernews_response(response, query="remotion video react")
single = hackernews.parse_hackernews_response(response, query="video")
print(json.dumps({
    "multi": [item["id"] for item in multi],
    "body": next(item["text"] for item in multi if item["id"] == "2"),
    "single": [item["id"] for item in single],
    "unfiltered": len(hackernews.parse_hackernews_response(response)),
}))
`;
    const run = spawnSync("python3", ["-I", "-c", script, path.join(ROOT, "skills/research/trove-pulse/scripts")], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
    });
    expect(run.status).toBe(0);
    const seen = JSON.parse(run.stdout.trim().split("\n").at(-1) ?? "{}");
    // Story 2 names the topic only in its body. Stories 3 and 4 match the
    // optional words or a typo-tolerant neighbour, which Algolia returns.
    expect(seen.multi).toEqual(["1", "2"]);
    expect(seen.body).toContain("Remotion");
    // A one-word topic keeps the any-word behavior.
    expect(seen.single).toEqual(["3"]);
    expect(seen.unfiltered).toBe(4);
  });
});

function fixtureArtifact(overrides: {
  include?: string[];
  pathMap?: Record<string, string>;
  transforms?: unknown[];
  patches?: string[];
} = {}) {
  const sha = "a".repeat(40);
  const digest = `sha256:${"b".repeat(64)}`;
  const manifest = parseUpstreamManifest({
    version: 2,
    policy: {
      maximum_file_bytes: 65536,
      maximum_artifact_bytes: 262144,
      allow_binary: false,
      allow_generated: false,
    },
    sources: [{
      id: "fixture",
      repository: "file:///fixture",
      ref: "main",
      license: { expression: "MIT", evidence: "LICENSE" },
      artifacts: [{
        id: "example",
        upstream_path: "skills/example",
        local_path: "skills/research/example",
        base_sha: sha,
        base_tree_digest: digest,
        local_tree_digest: digest,
        patch_digest: digest,
        checked_sha: sha,
        checked_at: "2026-08-28T00:00:00Z",
        candidate_sha: null,
        imported_at: "2026-08-28T00:00:00Z",
        include: overrides.include ?? ["SKILL.md", "scripts/**"],
        exclude: [],
        path_map: overrides.pathMap ?? { "SKILL.md": "SKILL.md.tmpl" },
        transforms: overrides.transforms ?? [],
        patches: overrides.patches ?? ["upstream-patches/example/local.patch"],
        status: "active",
      }],
    }],
    skills: [{
      local_path: "skills/research/example",
      origin: "adapted",
      source_id: "fixture",
      upstream_path: "skills/example",
      evidence_sha: sha,
    }],
    external_records: [],
    not_vendored: {},
  }, { allowFileRepositories: true });
  return manifest.sources[0].artifacts[0];
}

describe("canonical artifact paths", () => {
  test("accepts the template, references, and scripts; rejects everything else", () => {
    expect(isCanonicalArtifactPath("SKILL.md.tmpl")).toBe(true);
    expect(isCanonicalArtifactPath("references/runtime-spec.md")).toBe(true);
    expect(isCanonicalArtifactPath("scripts/lib/x.py")).toBe(true);
    expect(isCanonicalArtifactPath("SKILL.md")).toBe(false);
    expect(isCanonicalArtifactPath("scripts")).toBe(false);
    expect(isCanonicalArtifactPath("assets/template.html")).toBe(true);
    expect(isCanonicalArtifactPath("demos/demo.mp4")).toBe(false);
    expect(isCanonicalArtifactPath("agents/openai.yaml")).toBe(false);
  });

  test("rejects git symlink mode 120000 in a selected path", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-git-symlink-"));
    try {
      const upstream = path.join(temporary, "upstream");
      fs.mkdirSync(path.join(upstream, "skills/example/rules"), { recursive: true });
      fs.writeFileSync(
        path.join(upstream, "skills/example/SKILL.md"),
        "---\nname: example\ndescription: fixture\nlicense: MIT\n---\n",
      );
      fs.writeFileSync(path.join(upstream, "skills/example/rules/a.md"), "ok\n");
      fs.symlinkSync("a.md", path.join(upstream, "skills/example/rules/link.md"));
      runGit(upstream, ["init", "-q", "-b", "main"]);
      runGit(upstream, ["add", "."]);
      runGit(upstream, ["commit", "-q", "-m", "symlink"]);
      const sha = runGit(upstream, ["rev-parse", "HEAD"]) as FullSha;
      const digest = `sha256:${"b".repeat(64)}`;
      const manifest = parseUpstreamManifest({
        version: 2,
        policy: {
          maximum_file_bytes: 65536,
          maximum_artifact_bytes: 262144,
          allow_binary: false,
          allow_generated: false,
        },
        sources: [{
          id: "fixture",
          repository: pathToFileURL(upstream).href,
          ref: "main",
          license: { expression: "MIT", evidence: "LICENSE" },
          artifacts: [{
            id: "example",
            upstream_path: "skills/example",
            local_path: "skills/research/example",
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
            path_map: { "SKILL.md": "SKILL.md.tmpl" },
            transforms: [],
            patches: [],
            status: "active",
          }],
        }],
        skills: [{
          local_path: "skills/research/example",
          origin: "adapted",
          source_id: "fixture",
          upstream_path: "skills/example",
          evidence_sha: sha,
        }],
        external_records: [],
        not_vendored: {},
      }, { allowFileRepositories: true });
      expect(() => readGitSelection(
        path.join(upstream, ".git"),
        sha,
        manifest.sources[0].artifacts[0],
        manifest,
      )).toThrow("symlink");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  test("selects an included root file without widening a subdirectory artifact", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-root-selection-"));
    try {
      const upstream = path.join(temporary, "upstream");
      fs.mkdirSync(path.join(upstream, "skills/example"), { recursive: true });
      fs.writeFileSync(path.join(upstream, "SKILL.md"), "---\nname: root\nlicense: MIT\n---\n");
      fs.writeFileSync(path.join(upstream, "skills/example/SKILL.md"), "---\nname: nested\nlicense: MIT\n---\n");
      runGit(upstream, ["init", "-q", "-b", "main"]);
      runGit(upstream, ["add", "."]);
      runGit(upstream, ["commit", "-q", "-m", "root"]);
      const sha = runGit(upstream, ["rev-parse", "HEAD"]) as FullSha;
      const manifest = parseUpstreamManifest({
        version: 2,
        policy: { maximum_file_bytes: 1024, maximum_artifact_bytes: 4096, allow_binary: false, allow_generated: false },
        sources: [{
          id: "fixture",
          repository: pathToFileURL(upstream).href,
          ref: "main",
          license: { expression: "MIT", evidence: "LICENSE" },
          artifacts: [
            artifactRecord(sha, ".", ["SKILL.md"], "skills/root/example"),
            artifactRecord(sha, "skills/example", ["SKILL.md"], "skills/nested/example"),
          ],
        }],
        skills: [
          skillRecord(sha, ".", "skills/root/example"),
          skillRecord(sha, "skills/example", "skills/nested/example"),
        ],
        external_records: [],
        not_vendored: {},
      }, { allowFileRepositories: true });

      const rootSelection = readGitSelection(path.join(upstream, ".git"), sha, manifest.sources[0].artifacts[0], manifest);
      const nestedSelection = readGitSelection(path.join(upstream, ".git"), sha, manifest.sources[0].artifacts[1], manifest);
      expect(rootSelection.map((entry) => entry.path)).toEqual(["SKILL.md"]);
      expect(nestedSelection.map((entry) => entry.path)).toEqual(["SKILL.md"]);
      const all = readGitSelection(path.join(upstream, ".git"), sha, {
        ...manifest.sources[0].artifacts[0], include: ["**"],
      }, manifest);
      expect(all.map((entry) => entry.path).sort()).toEqual(["SKILL.md", "skills/example/SKILL.md"]);
      const named = readGitSelection(path.join(upstream, ".git"), sha, {
        ...manifest.sources[0].artifacts[0], include: ["**/SKILL.md"], exclude: ["skills/**"],
      }, manifest);
      expect(named.map((entry) => entry.path)).toEqual(["SKILL.md"]);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  test("round-trips scripts/** through transform, write, and walk with both file modes", () => {
    const artifact = fixtureArtifact();
    const transformed = transformSelection([
      { path: "SKILL.md", mode: "100644", bytes: Buffer.from("---\nname: example\n---\n") },
      { path: "scripts/lib/x.py", mode: "100644", bytes: Buffer.from("print('ok')\n") },
      { path: "scripts/run.sh", mode: "100755", bytes: Buffer.from("#!/bin/sh\n") },
    ], artifact);
    expect(transformed.map((entry) => [entry.path, entry.mode])).toEqual([
      ["scripts/lib/x.py", "100644"],
      ["scripts/run.sh", "100755"],
      ["SKILL.md.tmpl", "100644"],
    ]);

    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-canonical-roundtrip-"));
    try {
      writeEntries(temporary, transformed);
      const walked = walkLocal(temporary);
      expect(digestTree(walked)).toBe(digestTree(transformed));
      expect(walked.find((entry) => entry.path === "scripts/run.sh")?.mode).toBe("100755");
      expect(walked.find((entry) => entry.path === "scripts/lib/x.py")?.mode).toBe("100644");
      fs.mkdirSync(path.join(temporary, "scripts/lib/__pycache__"), { recursive: true });
      fs.writeFileSync(path.join(temporary, "scripts/lib/__pycache__/x.cpython-314.pyc"), Buffer.from([0, 1, 2]));
      expect(digestTree(walkLocal(temporary))).toBe(digestTree(transformed));
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  test("still rejects a transformed path outside the prefixes", () => {
    const artifact = fixtureArtifact({ pathMap: { "SKILL.md": "SKILL.md.tmpl", "demos/": "demos/" } });
    expect(() => transformSelection([
      { path: "SKILL.md", mode: "100644", bytes: Buffer.from("---\nname: example\n---\n") },
      { path: "demos/demo.mp4", mode: "100644", bytes: Buffer.from("demo") },
    ], artifact)).toThrow("outside canonical template content");
  });

  test("applies a patch that touches scripts/** and rejects one that does not", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-canonical-patch-"));
    try {
      const accepted = "upstream-patches/example/scripts.patch";
      const rejected = "upstream-patches/example/demos.patch";
      fs.mkdirSync(path.join(temporary, "upstream-patches/example"), { recursive: true });
      fs.writeFileSync(
        path.join(temporary, accepted),
        [
          "diff --git a/scripts/lib/x.py b/scripts/lib/x.py",
          "index 1111111..2222222 100644",
          "--- a/scripts/lib/x.py",
          "+++ b/scripts/lib/x.py",
          "@@ -1 +1 @@",
          "-old",
          "+new",
          "",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(temporary, rejected),
        [
          "diff --git a/demos/demo.mp4 b/demos/demo.mp4",
          "index 1111111..2222222 100644",
          "--- a/demos/demo.mp4",
          "+++ b/demos/demo.mp4",
          "",
        ].join("\n"),
      );
      expect(patchEntries(temporary, fixtureArtifact({ patches: [accepted] }))).toHaveLength(1);
      expect(() => patchEntries(temporary, fixtureArtifact({ patches: [rejected] })))
        .toThrow("outside canonical template content");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});

describe("replace-literal transform", () => {
  test("rejects unknown keys, missing hits, and non-canonical paths at parse time", () => {
    expect(() => fixtureArtifact({
      transforms: [{ kind: "replace-literal", path: "references/runtime-spec.md", from: "/x", to: "/y" }],
    })).toThrow("missing key 'minimum_occurrences'");
    expect(() => fixtureArtifact({
      transforms: [{
        kind: "replace-literal",
        path: "references/runtime-spec.md",
        from: "/x",
        to: "/y",
        minimum_occurrences: 1,
        extra: true,
      }],
    })).toThrow("unknown key 'extra'");
    expect(() => fixtureArtifact({
      transforms: [{
        kind: "replace-literal",
        path: "demos/demo.md",
        from: "/x",
        to: "/y",
        minimum_occurrences: 1,
      }],
    })).toThrow("must be SKILL.md.tmpl or under references/, scripts/, or assets/");
  });

  test("rewrites a mapped path and fails closed when the literal is missing", () => {
    const artifact = fixtureArtifact({
      pathMap: { "SKILL.md": "references/runtime-spec.md" },
      transforms: [{
        kind: "replace-literal",
        path: "references/runtime-spec.md",
        from: "/last30days",
        to: "/trove-research:trove-pulse",
        minimum_occurrences: 1,
      }],
    });
    const rewritten = transformSelection([{
      path: "SKILL.md",
      mode: "100644",
      bytes: Buffer.from("Use `/last30days` then `/last30days` again.\n"),
    }], artifact);
    expect(rewritten).toHaveLength(1);
    expect(rewritten[0].path).toBe("references/runtime-spec.md");
    expect(rewritten[0].bytes.toString("utf8")).toBe(
      "Use `/trove-research:trove-pulse` then `/trove-research:trove-pulse` again.\n",
    );

    const missing = fixtureArtifact({
      transforms: [{
        kind: "replace-literal",
        path: "SKILL.md.tmpl",
        from: "{{USER_TOPIC}}",
        to: "<topic>",
        minimum_occurrences: 1,
      }],
    });
    expect(() => transformSelection([{
      path: "SKILL.md",
      mode: "100644",
      bytes: Buffer.from("python {{SKILL_DIR}}/scripts/last30days.py\n"),
    }], missing)).toThrow("found 0 time(s)");
  });

  test("accepts the CN placeholder rewrite on SKILL.md.tmpl", () => {
    const artifact = fixtureArtifact({
      transforms: [
        {
          kind: "replace-literal",
          path: "SKILL.md.tmpl",
          from: "python {{SKILL_DIR}}",
          to: "python3 ${CLAUDE_SKILL_DIR}",
          minimum_occurrences: 1,
        },
        {
          kind: "replace-literal",
          path: "SKILL.md.tmpl",
          from: "{{USER_TOPIC}}",
          to: "<topic>",
          minimum_occurrences: 1,
        },
      ],
    });
    const rewritten = transformSelection([{
      path: "SKILL.md",
      mode: "100644",
      bytes: Buffer.from("python {{SKILL_DIR}}/scripts/last30days.py \"{{USER_TOPIC}}\"\n"),
    }], artifact);
    expect(rewritten[0].bytes.toString("utf8")).toBe(
      "python3 ${CLAUDE_SKILL_DIR}/scripts/last30days.py \"<topic>\"\n",
    );
  });
});

describe("local_only and per-artifact policy", () => {
  test("omits local_only paths from the lock digest but still validates them", () => {
    const sha = "a".repeat(40);
    const placeholder = `sha256:${"b".repeat(64)}`;
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-local-only-"));
    try {
      const local = path.join(temporary, "skills/research/example");
      fs.mkdirSync(path.join(local, "references"), { recursive: true });
      fs.writeFileSync(path.join(local, "SKILL.md.tmpl"), "wrapper\n");
      fs.writeFileSync(path.join(local, "references/runtime-spec.md"), "spec\n");
      const owned: TreeEntry[] = [
        { path: "references/runtime-spec.md", mode: "100644", bytes: Buffer.from("spec\n") },
      ];
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
          license: { expression: "MIT", evidence: "LICENSE" },
          artifacts: [{
            id: "example",
            upstream_path: "skills/example",
            local_path: "skills/research/example",
            base_sha: sha,
            base_tree_digest: placeholder,
            local_tree_digest: digestTree(owned),
            patch_digest: digestTree([]),
            checked_sha: sha,
            checked_at: "2026-08-28T00:00:00Z",
            candidate_sha: null,
            imported_at: "2026-08-28T00:00:00Z",
            include: ["SKILL.md", "references/**"],
            exclude: [],
            path_map: { "SKILL.md": "references/runtime-spec.md" },
            transforms: [],
            patches: [],
            local_only: ["SKILL.md.tmpl"],
            status: "active",
          }],
        }],
        skills: [{
          local_path: "skills/research/example",
          origin: "adapted",
          source_id: "fixture",
          upstream_path: "skills/example",
          evidence_sha: sha,
        }],
        external_records: [],
        not_vendored: {},
      }, { allowFileRepositories: true });
      const artifact = manifest.sources[0].artifacts[0];
      expect(lockEntries(walkLocal(local), artifact).map((entry) => entry.path))
        .toEqual(["references/runtime-spec.md"]);
      expect(() => checkOffline(temporary, manifest)).not.toThrow();
      fs.writeFileSync(path.join(local, "SKILL.md.tmpl"), "wrapper edited\n");
      expect(() => checkOffline(temporary, manifest)).not.toThrow();
      fs.writeFileSync(path.join(local, "references/runtime-spec.md"), "spec edited\n");
      expect(() => checkOffline(temporary, manifest)).toThrow("local tree digest does not match manifest");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  test("rejects a per-artifact policy that lowers a limit and preserves defaults when omitted", () => {
    const sha = "a".repeat(40);
    const digest = `sha256:${"b".repeat(64)}`;
    const base = {
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
        license: { expression: "MIT", evidence: "LICENSE" },
        artifacts: [{
          id: "example",
          upstream_path: "skills/example",
          local_path: "skills/research/example",
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
          transforms: [],
          patches: [],
          status: "active",
        }],
      }],
      skills: [{
        local_path: "skills/research/example",
        origin: "adapted",
        source_id: "fixture",
        upstream_path: "skills/example",
        evidence_sha: sha,
      }],
      external_records: [],
      not_vendored: {},
    };
    const lowered = structuredClone(base);
    ((lowered.sources[0].artifacts[0]) as Record<string, unknown>).policy = { maximum_file_bytes: 1 };
    expect(() => parseUpstreamManifest(lowered, { allowFileRepositories: true }))
      .toThrow("must not lower the manifest maximum_file_bytes");

    const raised = structuredClone(base);
    ((raised.sources[0].artifacts[0]) as Record<string, unknown>).policy = {
      maximum_file_bytes: 524288,
      maximum_artifact_bytes: 8388608,
    };
    const parsed = parseUpstreamManifest(raised, { allowFileRepositories: true });
    expect(effectivePolicy(parsed, parsed.sources[0].artifacts[0])).toEqual({
      maximumFileBytes: 524288,
      maximumArtifactBytes: 8388608,
      allowBinary: false,
      allowGenerated: false,
    });
    const omitted = parseUpstreamManifest(base, { allowFileRepositories: true });
    expect(effectivePolicy(omitted, omitted.sources[0].artifacts[0])).toEqual(omitted.policy);
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

function createLocalOnlyUpdateFixture(): UpdateFixture {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-update-local-only-"));
  const upstream = path.join(temporary, "upstream");
  const root = path.join(temporary, "root");
  fs.mkdirSync(path.join(upstream, "skills/example/rules"), { recursive: true });
  fs.writeFileSync(
    path.join(upstream, "skills/example/SKILL.md"),
    "---\nname: fixture-skill\ndescription: fixture\nlicense: MIT\n---\n\n# Fixture\n",
  );
  fs.writeFileSync(path.join(upstream, "skills/example/rules/a.md"), "upstream one\n");
  runGit(upstream, ["init", "-q", "-b", "main"]);
  runGit(upstream, ["add", "."]);
  runGit(upstream, ["commit", "-q", "-m", "base"]);
  const baseSha = runGit(upstream, ["rev-parse", "HEAD"]);

  fs.mkdirSync(root, { recursive: true });
  const raw = fixtureRaw(pathToFileURL(upstream).href, 4096);
  const rawArtifact = ((raw.sources as Record<string, unknown>[])[0].artifacts as Record<string, unknown>[])[0];
  rawArtifact.transforms = [];
  rawArtifact.patches = [];
  rawArtifact.local_only = ["SKILL.md.tmpl"];
  rawArtifact.base_sha = baseSha;
  rawArtifact.checked_sha = baseSha;
  (raw.skills as Record<string, unknown>[])[0].evidence_sha = baseSha;

  let manifest = parseUpstreamManifest(raw, { allowFileRepositories: true });
  const artifact = manifest.sources[0].artifacts[0];
  const selected: TreeEntry[] = [
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
  const transformed = transformSelection(selected, artifact);
  writeEntryTree(path.join(root, "skills/coding/trove-example"), transformed);
  fs.writeFileSync(path.join(root, "skills/coding/trove-example/SKILL.md.tmpl"), "wrapper\n");
  fs.writeFileSync(
    path.join(root, "skills/coding/trove-example/SKILL.md"),
    "---\nname: trove-example\n---\n\ngenerated\n",
  );
  const bytecodeDir = path.join(root, "skills/coding/trove-example/scripts/lib/__pycache__");
  fs.mkdirSync(bytecodeDir, { recursive: true });
  fs.writeFileSync(path.join(bytecodeDir, "x.cpython-314.pyc"), Buffer.from([0, 1, 2]));

  rawArtifact.base_tree_digest = digestTree(selected);
  rawArtifact.local_tree_digest = digestTree(lockEntries(
    walkLocal(path.join(root, "skills/coding/trove-example")),
    artifact,
  ));
  rawArtifact.patch_digest = digestTree([]);

  fs.writeFileSync(path.join(upstream, "skills/example/rules/b.md"), "new upstream file\n");
  runGit(upstream, ["add", "-A"]);
  runGit(upstream, ["commit", "-q", "-m", "add"]);

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
  // The build writes a generated SKILL.md next to the template. The sync does
  // not own it — walkLocal ignores it and it is absent from every tree digest —
  // but an update must not destroy it either.
  fs.writeFileSync(
    path.join(root, "skills/coding/trove-example/SKILL.md"),
    "---\nname: trove-example\n---\n\ngenerated\n",
  );
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
      // The directory swap must carry across files the sync does not own.
      expect(fs.readFileSync(path.join(fixture.root, "skills/coding/trove-example/SKILL.md"), "utf8"))
        .toContain("generated");
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

  test("renders the review checklist only when an update applies", () => {
    const fixture = createUpdateFixture("add");
    try {
      const offline = checkOffline(fixture.root, fixture.manifest);
      expect(renderMarkdown(offline)).not.toContain("## Review checklist");

      const updated = updateArtifacts(fixture.root, fixture.manifest, { artifactId: "trove-example" }, {
        verify: () => ["fixture verification"],
      });
      const markdown = renderMarkdown(updated);
      expect(markdown).toContain("## Review checklist");
      expect(markdown).toContain("shell=True");
      expect(markdown).toContain("Do the Trove tests in `tests/` pass?");
    } finally {
      fixture.cleanup();
    }
  });

  test.each([false, true])("keeps rollback backups out of skill discovery during verification: %s", (fail) => {
    const fixture = createUpdateFixture("add");
    try {
      let verified = false;
      const report = updateArtifacts(fixture.root, fixture.manifest, { artifactId: "trove-example" }, {
        verify: () => {
          const updated = loadUpstreamManifest(fixture.root, "upstream.yaml", { allowFileRepositories: true });
          validateManifestInventory(updated, fixture.root);
          expect(maintainedSkills(fixture.root)).toEqual(["trove-example"]);
          expect(fs.readdirSync(path.join(fixture.root, "skills/coding"))).toEqual(["trove-example"]);
          verified = true;
          if (fail) throw new Error("fixture verifier failed");
          return ["fixture discovery verification"];
        },
      });
      expect(verified).toBe(true);
      expect(report.artifacts[0].conclusion).toBe(fail ? "validation-failed" : "updated");
      const gitDirectory = runGit(fixture.root, ["rev-parse", "--absolute-git-dir"]);
      expect(fs.readdirSync(gitDirectory).filter((name) => name.startsWith("trove-sync-"))).toEqual([]);
      if (fail) expect(runGit(fixture.root, ["status", "--porcelain"])).toBe("");
    } finally {
      fixture.cleanup();
    }
  });

  test("records a local_only digest and preserves the wrapper plus skips bytecode", () => {
    const fixture = createLocalOnlyUpdateFixture();
    try {
      const wrapper = path.join(fixture.root, "skills/coding/trove-example/SKILL.md.tmpl");
      const bytecode = path.join(
        fixture.root,
        "skills/coding/trove-example/scripts/lib/__pycache__/x.cpython-314.pyc",
      );
      expect(fs.readFileSync(wrapper, "utf8")).toBe("wrapper\n");
      expect(fs.existsSync(bytecode)).toBe(true);

      const report = updateArtifacts(fixture.root, fixture.manifest, { artifactId: "trove-example" }, {
        verify: () => ["fixture verification"],
      });
      expect(report.artifacts[0].conclusion).toBe("updated");
      expect(fs.readFileSync(wrapper, "utf8")).toBe("wrapper\n");
      expect(fs.existsSync(bytecode)).toBe(false);
      expect(fs.readFileSync(
        path.join(fixture.root, "skills/coding/trove-example/references/b.md"),
        "utf8",
      )).toBe("new upstream file\n");

      const updated = loadUpstreamManifest(fixture.root, "upstream.yaml", { allowFileRepositories: true });
      const artifact = updated.sources[0].artifacts[0];
      const locked = lockEntries(
        walkLocal(path.join(fixture.root, "skills/coding/trove-example")),
        artifact,
      );
      expect(locked.map((entry) => entry.path)).toEqual(["references/a.md", "references/b.md"]);
      expect(artifact.localTreeDigest).toBe(digestTree(locked));
      expect(() => checkOffline(fixture.root, updated)).not.toThrow();
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

  test.each([false, true])("preserves tracked symlinks when verification fails: %s", (fail) => {
    const fixture = createUpdateFixture("add");
    const outside = path.join(fixture.upstream, "outside.txt");
    try {
      fs.writeFileSync(outside, "outside sentinel\n");
      fs.mkdirSync(path.join(fixture.root, ".claude/commands"), { recursive: true });
      fs.mkdirSync(path.join(fixture.root, "commands"));
      const target = path.join(fixture.root, "commands/example.md");
      const link = path.join(fixture.root, ".claude/commands/example.md");
      const dangling = path.join(fixture.root, "dangling-link");
      fs.writeFileSync(target, "command\n", { mode: 0o755 });
      fs.symlinkSync("../../commands/example.md", link);
      fs.symlinkSync("missing-target", dangling);
      runGit(fixture.root, ["add", "."]);
      runGit(fixture.root, ["commit", "-q", "-m", "tracked links"]);

      const report = updateArtifacts(fixture.root, fixture.manifest, { artifactId: "trove-example" }, {
        verify: () => {
          if (fail) {
            fs.unlinkSync(link);
            fs.writeFileSync(link, "replaced link\n");
            fs.unlinkSync(target);
            fs.symlinkSync(outside, target);
            fs.unlinkSync(dangling);
            throw new Error("fixture verifier failed");
          }
          return ["fixture verification"];
        },
      });
      expect(report.artifacts[0].conclusion).toBe(fail ? "validation-failed" : "updated");
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(link)).toBe("../../commands/example.md");
      expect(fs.readlinkSync(dangling)).toBe("missing-target");
      expect(fs.lstatSync(target).isFile()).toBe(true);
      expect(fs.readFileSync(target, "utf8")).toBe("command\n");
      expect(fs.statSync(target).mode & 0o777).toBe(0o755);
      expect(fs.readFileSync(outside, "utf8")).toBe("outside sentinel\n");
      if (fail) expect(runGit(fixture.root, ["status", "--porcelain"])).toBe("");
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

describe("pinned license evidence", () => {
  // `rules/a.md` is the same bytes at base and candidate in every fixture, so it
  // stands in for a root LICENSE that sits outside the selected tree.
  const EVIDENCE = "skills/example/rules/a.md";
  const sha256 = (data: string | Buffer): string => `sha256:${createHash("sha256").update(data).digest("hex")}`;
  const withLicense = (manifest: UpstreamManifest, license: Record<string, string>): UpstreamManifest => ({
    ...manifest,
    sources: manifest.sources.map((source) => ({ ...source, license: license as unknown as LicenseRecord })),
  });
  /** Runs the updater with a license built from the fixture's real evidence bytes. */
  const conclude = (
    change: FixtureChange,
    license: (evidenceDigest: string) => Record<string, string>,
  ) => {
    const fixture = createUpdateFixture(change);
    try {
      const actual = sha256(fs.readFileSync(path.join(fixture.upstream, EVIDENCE)));
      const report = updateArtifacts(fixture.root, withLicense(fixture.manifest, license(actual)), {
        artifactId: "trove-example",
      }, {
        verify: () => ["fixture verification"],
      }).artifacts[0];
      return { report, actual };
    } finally {
      fixture.cleanup();
    }
  };

  test("accepts a commit whose evidence file matches the pin", () => {
    const { report } = conclude("add", (digest) => ({ expression: "MIT", evidence: EVIDENCE, evidenceDigest: digest }));
    expect(report.conclusion).toBe("updated");
    expect(report.license.status).toBe("unchanged");
  });

  test("fails closed when the evidence file's bytes change", () => {
    const { report, actual } = conclude("add", () => ({
      expression: "MIT",
      evidence: EVIDENCE,
      evidenceDigest: sha256("other\n"),
    }));
    expect(report.conclusion).toBe("license-changed");
    expect(report.license.status).toBe("changed");
    expect(report.license.actual).toContain(actual);
  });

  test("reports a missing evidence file as a missing license", () => {
    const { report } = conclude("add", (digest) => ({ expression: "MIT", evidence: "LICENSE", evidenceDigest: digest }));
    expect(report.conclusion).toBe("license-changed");
    expect(report.license.status).toBe("missing");
  });

  test("ignores SKILL.md frontmatter once the evidence is pinned", () => {
    // The `license` change rewrites upstream frontmatter to Apache-2.0. A pinned
    // source takes its license from the evidence file, so that edit is not a
    // license change.
    const { report } = conclude("license", (digest) => ({ expression: "MIT", evidence: EVIDENCE, evidenceDigest: digest }));
    expect(report.conclusion).not.toBe("license-changed");
  });

  test("the manifest keeps a valid pin and rejects a malformed one", () => {
    const raw = fixtureRaw("https://example.com/fixture.git", 4096);
    const source = (raw.sources as Record<string, unknown>[])[0];
    source.license = { expression: "MIT", evidence: "LICENSE", evidence_digest: sha256("x") };
    expect(parseUpstreamManifest(raw).sources[0].license.evidenceDigest).toBe(sha256("x"));

    source.license = { expression: "MIT", evidence: "LICENSE", evidence_digest: "not-a-digest" };
    expect(() => parseUpstreamManifest(raw)).toThrow(ManifestError);
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

  test("keeps the sync token off every step that processes upstream clones", () => {
    expect(JSON.stringify(update.env ?? {})).not.toContain("UPSTREAM_SYNC_TOKEN");
    const tokenSteps = (update.steps as Record<string, unknown>[]).filter(
      (step) => JSON.stringify(step.env ?? {}).includes("UPSTREAM_SYNC_TOKEN"),
    );
    expect(tokenSteps).toHaveLength(1);
    expect(JSON.stringify(tokenSteps[0]?.run ?? "")).toContain("gh pr create");
    for (const step of update.steps as Record<string, unknown>[]) {
      const run = typeof step.run === "string" ? step.run : "";
      if (!run.includes("sync:upstream")) continue;
      expect(JSON.stringify(step.env ?? {})).not.toContain("UPSTREAM_SYNC_TOKEN");
    }
  });

  test("describes the update artifact input as free-form", () => {
    const inputs = (workflow.on as { workflow_dispatch: { inputs: Record<string, { description?: string; default?: string }> } })
      .workflow_dispatch.inputs;
    expect(inputs.artifact.default).toBe("trove-react-view-transitions");
    expect(inputs.artifact.description?.toLowerCase()).toContain("free-form");
  });
});
