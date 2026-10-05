import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { checkOnline, renderMarkdown, stableJson } from "../scripts/lib/upstream-sync";
import {
  ManifestError,
  parseUpstreamManifest,
  type FullSha,
} from "../scripts/lib/upstream-manifest";

function runGit(cwd: string, args: readonly string[], date = "2026-08-28T00:00:00Z"): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Trove Test",
      GIT_AUTHOR_EMAIL: "test@trove.invalid",
      GIT_COMMITTER_NAME: "Trove Test",
      GIT_COMMITTER_EMAIL: "test@trove.invalid",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || `${args.join(" ")} failed`);
  return result.stdout.trim();
}

function commitFile(upstream: string, relative: string, body: string, message: string, date: string): FullSha {
  const absolute = path.join(upstream, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, body);
  runGit(upstream, ["add", "--", relative]);
  runGit(upstream, ["commit", "-q", "-m", message], date);
  return runGit(upstream, ["rev-parse", "HEAD"]) as FullSha;
}

function adaptedManifest(
  repository: string,
  evidenceSha: FullSha,
  skill: { upstream_path?: string; upstream_paths?: readonly string[] },
): Record<string, unknown> {
  return {
    version: 2,
    policy: {
      maximum_file_bytes: 65536,
      maximum_artifact_bytes: 262144,
      allow_binary: false,
      allow_generated: false,
    },
    sources: [{
      id: "fixture",
      repository,
      ref: "main",
      license: { expression: "MIT", evidence: "LICENSE" },
      artifacts: [],
    }],
    skills: [{
      local_path: "skills/documentation/example",
      origin: "adapted",
      source_id: "fixture",
      evidence_sha: evidenceSha,
      ...skill,
    }],
    external_records: [],
    not_vendored: {},
  };
}

interface ReviewFixture {
  root: string;
  evidenceSha: FullSha;
  candidateSha: FullSha;
  cleanup: () => void;
}

function createReviewFixture(): ReviewFixture {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "trove-adapted-review-"));
  const upstream = path.join(temporary, "upstream");
  const root = path.join(temporary, "root");
  fs.mkdirSync(upstream, { recursive: true });
  fs.mkdirSync(path.join(root, "skills/documentation/example"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills/documentation/example/SKILL.md.tmpl"), "---\nname: example\n---\n");
  fs.writeFileSync(path.join(upstream, "LICENSE"), "MIT\n");
  runGit(upstream, ["init", "-q", "-b", "main"]);
  const evidenceSha = commitFile(upstream, "README.md", "base\n", "base", "2026-08-28T00:00:00Z");
  commitFile(upstream, "elsewhere/note.md", "untouched area\n", "elsewhere", "2026-08-29T00:00:00Z");
  const candidateSha = commitFile(
    upstream,
    "skills/watched/SKILL.md",
    "---\nname: watched\n---\n",
    "touch watched",
    "2026-08-30T00:00:00Z",
  );
  return {
    root,
    evidenceSha,
    candidateSha,
    cleanup: () => fs.rmSync(temporary, { recursive: true, force: true }),
  };
}

describe("adapted source review", () => {
  test("a commit touching only an unlisted directory is not review due", () => {
    const fixture = createReviewFixture();
    try {
      const manifest = parseUpstreamManifest(
        adaptedManifest(pathToFileURL(path.join(path.dirname(fixture.root), "upstream")).href, fixture.evidenceSha, {
          upstream_path: "skills/other",
        }),
        { allowFileRepositories: true },
      );
      const report = checkOnline(fixture.root, manifest);
      expect(report.reviews).toEqual([]);
      expect(renderMarkdown(report)).not.toContain("review due");
    } finally {
      fixture.cleanup();
    }
  });

  test("a commit touching a listed path is review due and names the path and commit range", () => {
    const fixture = createReviewFixture();
    try {
      const repository = pathToFileURL(path.join(path.dirname(fixture.root), "upstream")).href;
      const manifest = parseUpstreamManifest(
        adaptedManifest(repository, fixture.evidenceSha, {
          upstream_paths: ["skills/watched", "docs/extra"],
        }),
        { allowFileRepositories: true },
      );
      const report = checkOnline(fixture.root, manifest);
      const range = `${fixture.evidenceSha}..${fixture.candidateSha}`;
      expect(report.reviews).toEqual([{
        skill: "skills/documentation/example",
        source: "fixture",
        conclusion: "review-due",
        evidence_sha: fixture.evidenceSha,
        candidate_sha: fixture.candidateSha,
        range,
        changed_paths: ["skills/watched/SKILL.md"],
      }]);
      const markdown = renderMarkdown(report);
      const json = stableJson(report);
      expect(markdown).toContain("review due");
      expect(markdown).toContain("skills/watched/SKILL.md");
      expect(markdown).toContain(range);
      expect(json).toContain("skills/watched/SKILL.md");
      expect(json).toContain(range);
    } finally {
      fixture.cleanup();
    }
  });

  test("a row holds upstream_path or upstream_paths, never both", () => {
    const sha = "a".repeat(40);
    const single = adaptedManifest("https://example.com/fixture.git", sha as FullSha, {
      upstream_path: "skills/watched",
    });
    expect(parseUpstreamManifest(single).skills[0]).toMatchObject({
      origin: "adapted",
      upstreamPaths: ["skills/watched"],
    });

    const listed = adaptedManifest("https://example.com/fixture.git", sha as FullSha, {
      upstream_paths: ["skills/watched", "docs/extra"],
    });
    expect(parseUpstreamManifest(listed).skills[0]).toMatchObject({
      origin: "adapted",
      upstreamPaths: ["skills/watched", "docs/extra"],
    });

    const both = adaptedManifest("https://example.com/fixture.git", sha as FullSha, {
      upstream_path: "skills/watched",
      upstream_paths: ["skills/watched"],
    });
    expect(() => parseUpstreamManifest(both)).toThrow(ManifestError);
    expect(() => parseUpstreamManifest(both)).toThrow(/upstream_path/);
  });
});
