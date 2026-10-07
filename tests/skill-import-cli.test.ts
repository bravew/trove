import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runImportCli, type ImportCliDependencies } from "../scripts/import-skill";
import { loadUpstreamManifest } from "../scripts/lib/upstream-manifest";
import { checkOffline } from "../scripts/lib/upstream-sync";
import type { FetchResult } from "../scripts/lib/skill-import/types";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const DECLARED = "https://example.com/fixture.git";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Trove Test",
      GIT_AUTHOR_EMAIL: "test@trove.invalid",
      GIT_COMMITTER_NAME: "Trove Test",
      GIT_COMMITTER_EMAIL: "test@trove.invalid",
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return (result.stdout ?? "").trim();
}

function snapshot(directory: string, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.name === ".git") continue;
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) Object.assign(files, snapshot(absolute, relative));
    else files[relative] = fs.readFileSync(absolute).toString("base64");
  }
  return files;
}

const MANIFEST = `version: 2
policy:
  maximum_file_bytes: 262144
  maximum_artifact_bytes: 4194304
  allow_binary: false
  allow_generated: false
sources: []
skills: []
external_records: []
not_vendored: {}
`;

function makeTarget(): string {
  const root = temporaryDirectory("trove-cli-target-");
  fs.mkdirSync(path.join(root, "external"), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, "external", "policy.yaml"), path.join(root, "external", "policy.yaml"));
  fs.writeFileSync(path.join(root, "upstream.yaml"), MANIFEST);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "fixture"]);
  return root;
}

function makeUpstream(files: Record<string, string>): { directory: string; sha: string } {
  const directory = temporaryDirectory("trove-cli-upstream-");
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(directory, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  git(directory, ["init", "-q", "-b", "main"]);
  git(directory, ["add", "-A"]);
  git(directory, ["commit", "-q", "-m", "fixture"]);
  return { directory, sha: git(directory, ["rev-parse", "HEAD"]) };
}

const MIT_LICENSE = "MIT License\n\nPermission is hereby granted, free of charge, to any person.\n";
const SKILL = `---
name: fixture-skill
description: A fixture skill used only by the import CLI tests.
license: MIT
allowed-tools:
  - Bash
  - Read
---

Hello.
`;

const BENIGN_FILES: Record<string, string> = {
  LICENSE: MIT_LICENSE,
  "SKILL.md": SKILL,
  "notes/guide.md": "# Guide\n\nPlain reference text.\n",
  "scripts/render.py": 'TEMPLATES = HERE.parent / "templates"\n',
  "templates/platform.json": '{ "platform": "fixture" }\n',
};

function stubFetch(directory: string, sha: string, cleanup: () => Promise<void> = async () => {}): NonNullable<ImportCliDependencies["fetchSource"]> {
  return async (): Promise<FetchResult> => ({
    repository: DECLARED,
    resolvedSha: sha,
    gitDirectory: path.join(directory, ".git"),
    cleanup,
  });
}

interface CliRun {
  code: number;
  out: string;
  err: string;
}

async function run(args: readonly string[], deps: ImportCliDependencies = {}): Promise<CliRun> {
  let out = "";
  let err = "";
  const code = await runImportCli(args, {
    ...deps,
    out: (line) => { out += `${line}\n`; },
    err: (line) => { err += `${line}\n`; },
  });
  return { code, out, err };
}

function benignDeps(files: Record<string, string> = BENIGN_FILES) {
  const upstream = makeUpstream(files);
  return { upstream, deps: { fetchSource: stubFetch(upstream.directory, upstream.sha) } as ImportCliDependencies };
}

const STAGE_SELECTION = ["--include", "SKILL.md", "--include", "notes/**", "--include", "scripts/**", "--include", "templates/**"];

describe("import-skill CLI", () => {
  test("--inspect writes only under .trove/import/<id>/", async () => {
    const target = makeTarget();
    const { deps } = benignDeps();
    const before = snapshot(target);

    const result = await run(["--inspect", DECLARED, "--root", target, "--id", "fixture"], deps);

    expect(result.code).toBe(0);
    const after = snapshot(target);
    for (const [key, value] of Object.entries(after)) {
      if (key in before) expect(value).toBe(before[key]);
      else expect(key.startsWith(".trove/import/fixture/")).toBe(true);
    }
    expect(fs.existsSync(path.join(target, ".trove/import/fixture/report.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, ".trove/import/fixture/report.md"))).toBe(true);
    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/fixture/report.json"), "utf8"));
    expect(report.source.resolved_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(report.selection.files).toBeGreaterThan(0);
    expect(report.selection.bytes).toBeGreaterThan(0);
    expect(report.license.verdict).toBe("ok");
    expect(report.license.expression).toBe("MIT");
    expect(report.license.path).toBe("LICENSE");
    expect(report.proposed_transforms.length).toBeGreaterThan(0);
    expect(report.staged).toBeNull();
  });

  test("--path scans a subtree with skill-relative layout and keeps the root license", async () => {
    const target = makeTarget();
    const { deps } = benignDeps({
      LICENSE: MIT_LICENSE,
      "skills/defuddle/SKILL.md": SKILL,
      "skills/defuddle/references/notes.md": "# Notes\n",
      "skills/defuddle/scripts/run.py": "print('ok')\n",
    });

    const result = await run(["--inspect", DECLARED, "--root", target, "--id", "defuddle", "--path", "skills/defuddle", "--include", "**"], deps);

    expect(result.code).toBe(0);
    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/defuddle/report.json"), "utf8"));
    expect(report.selection.files).toBe(4);
    expect(report.license.expression).toBe("MIT");
    expect(report.license.path).toBe("LICENSE");
    expect(report.findings.map((finding: { message: string }) => finding.message).join("\n")).not.toMatch(/support directory 'skills\//);
  });

  test("--inspect accepts --dry-run and writes nothing at all", async () => {
    const target = makeTarget();
    const { deps } = benignDeps();
    const before = snapshot(target);

    const result = await run(["--inspect", "--dry-run", DECLARED, "--root", target, "--id", "fixture", "--license-path", "LICENSE"], deps);

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(target, ".trove"))).toBe(false);
    expect(snapshot(target)).toEqual(before);
  });

  test("contradicting modes and flags fail before any fetch", async () => {
    const target = makeTarget();
    const exploding: ImportCliDependencies = { fetchSource: async () => { throw new Error("fetch must not run"); } };
    const cases: Array<[string[], RegExp]> = [
      [["--stage", "--inspect", DECLARED, "--root", target], /mutually exclusive/],
      [["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "adapted", "--license", "MIT", "--split-front"], /vendored/],
      [["--inspect", DECLARED, "--root", target, "--path", "--stage"], /requires a value/],
      [["--inspect", DECLARED, "--root", target, "--nope"], /unknown option/],
      [["--inspect", DECLARED, "extra", "--root", target], /exactly one source/],
      [["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media"], /requires --mode/],
      [["--stage", DECLARED, "--root", target, "--id", "Trove-Bad", "--plugin", "trove-media", "--category", "media", "--mode", "vendored"], /kebab-case/],
      [["--inspect", DECLARED, "--root", target, "--accept-transform", "1"], /only valid with --stage/],
      [["--inspect", DECLARED, "--root", target, "--json", "../escape.json"], /must stay under/],
      [["--inspect", DECLARED, "--root", target, "--json", path.join(target, "outside.json")], /must stay under/],
      [["--inspect", DECLARED, "--root", target, "--path", "../.."], /'\.\.'/],
    ];
    for (const [args, pattern] of cases) {
      const result = await run(args, exploding);
      expect(result.code, args.join(" ")).toBe(1);
      expect(result.err, args.join(" ")).toMatch(pattern);
    }
  });

  test("a hard reject exits non-zero, reports it, and never stages", async () => {
    const target = makeTarget();
    const { deps } = benignDeps({ ...BENIGN_FILES, "scripts/bad.py": `print("${String.fromCharCode(0x202e)}hidden")\n` });
    const manifestBefore = fs.readFileSync(path.join(target, "upstream.yaml"), "utf8");

    const result = await run(
      ["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "vendored", "--license", "MIT", ...STAGE_SELECTION],
      deps,
    );

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/hard reject|reject/i);
    expect(fs.existsSync(path.join(target, "skills"))).toBe(false);
    expect(fs.readFileSync(path.join(target, "upstream.yaml"), "utf8")).toBe(manifestBefore);
    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/trove-fixture/report.json"), "utf8"));
    expect(report.findings.some((finding: { severity: string }) => finding.severity === "hard-reject")).toBe(true);
    expect(report.staged).toBeNull();
  });

  test("--stage vendored writes locks that the offline check verifies", async () => {
    const target = makeTarget();
    const { deps, upstream } = benignDeps();

    const result = await run(
      ["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "vendored", "--license", "MIT",
        "--ref", "v1-fixture", "--path-map", "notes/:references/", "--path-map", "templates/:scripts/templates/", "--accept-transform", "1", "--local-only", "scripts/templates/**", ...STAGE_SELECTION],
      deps,
    );

    expect(result.code).toBe(0);
    const manifest = loadUpstreamManifest(target);
    const source = manifest.sources.find((entry) => entry.id === "trove-fixture");
    expect(source?.repository).toBe(DECLARED);
    expect(source?.ref).toBe(upstream.sha);
    const artifact = source?.artifacts[0];
    expect(artifact?.baseSha).toBe(upstream.sha);
    expect(artifact?.localPath).toBe("skills/media/trove-fixture");
    expect(artifact?.localOnly).toContain("scripts/templates/**");
    expect(manifest.skills.find((entry) => entry.localPath === "skills/media/trove-fixture")).toMatchObject({
      origin: "adapted",
      sourceId: "trove-fixture",
      evidenceSha: upstream.sha,
    });

    const directory = path.join(target, "skills/media/trove-fixture");
    expect(fs.readFileSync(path.join(directory, "scripts/render.py"), "utf8")).toBe('TEMPLATES = HERE / "templates"\n');
    expect(fs.existsSync(path.join(directory, "scripts/templates/platform.json"))).toBe(true);
    expect(fs.readFileSync(path.join(directory, "references/guide.md"), "utf8")).toBe("# Guide\n\nPlain reference text.\n");
    expect(fs.readFileSync(path.join(directory, "references/LICENSE.md"), "utf8")).toBe(MIT_LICENSE);
    expect(fs.readFileSync(path.join(directory, "SKILL.md.tmpl"), "utf8")).not.toContain("allowed-tools");
    expect(checkOffline(target, manifest).artifacts[0]).toMatchObject({ conclusion: "no-changes", patch: { digest: "verified" } });

    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/trove-fixture/report.json"), "utf8"));
    expect(report.staged.local_path).toBe("skills/media/trove-fixture");
    expect(report.staged.offline_check.artifacts[0].conclusion).toBe("no-changes");
    expect(report.allowed_tools).toEqual(["Bash", "Read"]);
  });

  test("a post-stage verification error reports the files that were written", async () => {
    const target = makeTarget();
    const { deps } = benignDeps();
    const args = ["--stage", DECLARED, "--root", target, "--plugin", "trove-media", "--category", "media", "--mode", "vendored",
      "--path-map", "notes/:references/", "--path-map", "templates/:scripts/templates/", ...STAGE_SELECTION];
    expect((await run([...args, "--id", "trove-first"], deps)).code).toBe(0);
    fs.appendFileSync(path.join(target, "skills/media/trove-first/scripts/render.py"), "# local drift\n");

    const result = await run([...args, "--id", "trove-second"], deps);

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/local tree digest/);
    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/trove-second/report.json"), "utf8"));
    expect(report.staged.local_path).toBe("skills/media/trove-second");
    expect(report.staged.notes).toContain("staged; offline verification pending");
    expect(fs.existsSync(path.join(target, report.staged.local_path, "SKILL.md.tmpl"))).toBe(true);
  });

  test("--transforms applies a reviewed transform the scanner did not propose", async () => {
    const target = makeTarget();
    const { deps } = benignDeps({
      ...BENIGN_FILES,
      "scripts/_contract.py": 'ROOT = HERE.parent\nA = ROOT / "SKILL.md"\nB = ROOT / "SKILL.md"\n',
    });
    const transforms = path.join(temporaryDirectory("trove-cli-transforms-"), "transforms.json");
    fs.writeFileSync(transforms, JSON.stringify([
      { kind: "replace-literal", path: "scripts/_contract.py", from: 'ROOT / "SKILL.md"', to: 'ROOT / "references" / "runtime-spec.md"', minimumOccurrences: 2 },
    ]));

    const result = await run(
      ["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "vendored", "--license", "MIT",
        "--transforms", transforms, "--include", "SKILL.md", "--include", "scripts/**"],
      deps,
    );

    expect(result.code).toBe(0);
    const staged = fs.readFileSync(path.join(target, "skills/media/trove-fixture/scripts/_contract.py"), "utf8");
    expect(staged).toContain('ROOT / "references" / "runtime-spec.md"');
    expect(staged).not.toContain('ROOT / "SKILL.md"');
    expect(checkOffline(target, loadUpstreamManifest(target)).artifacts[0].conclusion).toBe("no-changes");
  });

  test("staging follows the detected license, and --license cannot relabel it", async () => {
    const frontmatterApache = SKILL.replace("license: MIT", "license: Apache-2.0");
    const mismatchTarget = makeTarget();
    const mismatch = benignDeps({ ...BENIGN_FILES, "SKILL.md": frontmatterApache });
    const before = snapshot(mismatchTarget);

    const refused = await run(
      ["--stage", DECLARED, "--root", mismatchTarget, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "vendored", "--license", "Apache-2.0", ...STAGE_SELECTION],
      mismatch.deps,
    );
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/does not match the detected 'MIT'/);
    expect(snapshot(mismatchTarget)).toEqual(before);

    const target = makeTarget();
    const { deps } = benignDeps({ ...BENIGN_FILES, "SKILL.md": frontmatterApache });
    const staged = await run(
      ["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "vendored",
        "--path-map", "notes/:references/", "--path-map", "templates/:scripts/templates/", ...STAGE_SELECTION],
      deps,
    );
    expect(staged.code).toBe(0);
    const manifest = loadUpstreamManifest(target);
    expect(manifest.sources.find((entry) => entry.id === "trove-fixture")?.license.expression).toBe("MIT");
    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/trove-fixture/report.json"), "utf8"));
    expect(report.license).toMatchObject({ expression: "MIT", path: "LICENSE", verdict: "ok" });
  });

  test("a malformed --transforms file fails before any fetch", async () => {
    const target = makeTarget();
    const directory = temporaryDirectory("trove-cli-transforms-bad-");
    const exploding: ImportCliDependencies = { fetchSource: async () => { throw new Error("fetch must not run"); } };
    const files: Array<[string, string, RegExp]> = [
      ["extra.json", JSON.stringify([{ kind: "replace-literal", path: "scripts/a.py", from: "a", to: "b", minimumOccurrences: 1, extra: true }]), /unknown key/],
      ["kind.json", JSON.stringify([{ kind: "rename-skill", path: "scripts/a.py", from: "a", to: "b", minimumOccurrences: 1 }]), /kind/],
      ["zero.json", JSON.stringify([{ kind: "replace-literal", path: "scripts/a.py", from: "a", to: "b", minimumOccurrences: 0 }]), /positive integer/],
      ["object.json", JSON.stringify({}), /JSON array/],
      ["path-type.json", JSON.stringify([{ kind: "replace-literal", path: 7, from: "a", to: "b", minimumOccurrences: 1 }]), /non-empty string/],
      ["from-type.json", JSON.stringify([{ kind: "replace-literal", path: "scripts/a.py", from: { a: 1 }, to: "b", minimumOccurrences: 1 }]), /non-empty string/],
      ["to-type.json", JSON.stringify([{ kind: "replace-literal", path: "scripts/a.py", from: "a", to: [], minimumOccurrences: 1 }]), /non-empty string/],
    ];
    for (const [name, content, pattern] of files) {
      const file = path.join(directory, name);
      fs.writeFileSync(file, content);
      const result = await run(["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "vendored", "--license", "MIT", "--transforms", file], exploding);
      expect(result.code, name).toBe(1);
      expect(result.err, name).toMatch(pattern);
    }
  });

  test("--stage --dry-run writes nothing, including reports", async () => {
    const target = makeTarget();
    const { deps } = benignDeps();
    const before = snapshot(target);

    const result = await run(
      ["--stage", "--dry-run", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "vendored", "--license", "MIT",
        "--path-map", "notes/:references/", "--path-map", "templates/:scripts/templates/", ...STAGE_SELECTION],
      deps,
    );

    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(target, ".trove"))).toBe(false);
    expect(fs.existsSync(path.join(target, "skills"))).toBe(false);
    expect(snapshot(target)).toEqual(before);
  });

  test("adapted staging records evidence and reports the pending front", async () => {
    const target = makeTarget();
    const { deps, upstream } = benignDeps();

    const result = await run(
      ["--stage", DECLARED, "--root", target, "--id", "trove-fixture", "--plugin", "trove-media", "--category", "media", "--mode", "adapted", "--license", "MIT",
        "--include", "SKILL.md", "--include", "notes/**"],
      deps,
    );

    expect(result.code).toBe(0);
    const manifest = loadUpstreamManifest(target);
    expect(manifest.sources.find((entry) => entry.id === "trove-fixture")?.artifacts).toEqual([]);
    expect(manifest.skills.find((entry) => entry.localPath === "skills/media/trove-fixture")).toMatchObject({ evidenceSha: upstream.sha });
    expect(fs.existsSync(path.join(target, "skills/media/trove-fixture/references/LICENSE.md"))).toBe(true);
    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/trove-fixture/report.json"), "utf8"));
    expect(report.staged.notes.join(" ")).toMatch(/SKILL\.md\.tmpl/);
  });

  test("reports excluded-but-suspicious entries from tree metadata without selecting them", async () => {
    const target = makeTarget();
    const { deps } = benignDeps({ ...BENIGN_FILES, "AGENTS.md": "instructions for agents\n", ".claude/settings.json": "{}\n", "mcp/server.py": "print('mcp')\n" });

    const result = await run(["--inspect", DECLARED, "--root", target, "--id", "fixture"], deps);

    expect(result.code).toBe(0);
    const report = JSON.parse(fs.readFileSync(path.join(target, ".trove/import/fixture/report.json"), "utf8"));
    const messages = report.findings.filter((finding: { severity: string }) => finding.severity === "flag").map((finding: { message: string }) => finding.message);
    expect(messages.some((message: string) => /AGENTS\.md/.test(message))).toBe(true);
    expect(messages.some((message: string) => /\.claude\//.test(message))).toBe(true);
    expect(messages.some((message: string) => /MCP/.test(message))).toBe(true);
    expect(report.findings.some((finding: { severity: string }) => finding.severity === "hard-reject")).toBe(false);
    expect(report.selection.exclude).toEqual(expect.arrayContaining(["AGENTS.md", ".claude/**", "mcp/**"]));
  });

  test("a cleanup failure changes the exit code", async () => {
    const upstream = makeUpstream(BENIGN_FILES);
    const deps: ImportCliDependencies = {
      fetchSource: stubFetch(upstream.directory, upstream.sha, async () => { throw new Error("cleanup exploded"); }),
    };

    const result = await run(["--inspect", DECLARED, "--root", makeTarget(), "--id", "fixture"], deps);

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/cleanup failed/);
  });

  test("refuses a symlinked report directory instead of writing through it", async () => {
    const target = makeTarget();
    const { deps } = benignDeps();
    const elsewhere = temporaryDirectory("trove-cli-elsewhere-");
    fs.mkdirSync(path.join(target, ".trove"), { recursive: true });
    fs.symlinkSync(elsewhere, path.join(target, ".trove", "import"));

    const result = await run(["--inspect", DECLARED, "--root", target, "--id", "fixture"], deps);

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/symlink/i);
    expect(fs.readdirSync(elsewhere)).toEqual([]);
  });

  test("replacing a hardlinked report file leaves the outside link untouched", async () => {
    const target = makeTarget();
    const { deps } = benignDeps();
    const outside = path.join(temporaryDirectory("trove-cli-hardlink-"), "outside.json");
    fs.writeFileSync(outside, "original outside content\n");
    const reportRoot = path.join(target, ".trove", "import", "fixture");
    fs.mkdirSync(reportRoot, { recursive: true });
    fs.linkSync(outside, path.join(reportRoot, "report.json"));

    const result = await run(["--inspect", DECLARED, "--root", target, "--id", "fixture"], deps);

    expect(result.code).toBe(0);
    expect(fs.readFileSync(outside, "utf8")).toBe("original outside content\n");
    const report = JSON.parse(fs.readFileSync(path.join(reportRoot, "report.json"), "utf8"));
    expect(report.source.repository).toBe(DECLARED);
  });
});
