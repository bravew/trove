import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fetchSource, type FetchRequest } from "../scripts/lib/skill-import/fetch";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

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
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

interface PublishedRepo {
  root: string;
  bare: string;
  sha: string;
}

/** A real git history published to a local bare remote, committed nowhere in this repo. */
function publishRepo(root: string, name: string): PublishedRepo {
  const work = path.join(root, name);
  const bare = path.join(root, `${name}.git`);
  fs.mkdirSync(work, { recursive: true });
  runGit(work, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(work, "README"), "fixture\n");
  runGit(work, ["add", "README"]);
  runGit(work, ["commit", "-q", "-m", "init"]);
  const sha = runGit(work, ["rev-parse", "HEAD"]);
  runGit(root, ["clone", "-q", "--bare", work, bare]);
  runGit(work, ["remote", "add", "origin", bare]);
  return { root: work, bare, sha };
}

/**
 * Tests never touch the network. The injected resolver hands fetch the local bare
 * repository that stands in for the https remote the caller declared.
 */
function resolveRemote(bare: string): NonNullable<FetchRequest["resolveRemote"]> {
  return (repository) => {
    if (!repository.startsWith("https://")) {
      throw new Error(`refusing non-https remote: ${repository}`);
    }
    return bare;
  };
}

describe("skill import fetch", () => {
  test("does not run an upstream post-checkout hook", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-fetch-hook-"));
    const sentinel = path.join(root, "sentinel");
    const previousTemplate = process.env.GIT_TEMPLATE_DIR;
    try {
      const published = publishRepo(root, "upstream");
      const template = path.join(root, "template");
      fs.mkdirSync(path.join(template, "hooks"), { recursive: true });
      fs.writeFileSync(
        path.join(template, "hooks", "post-checkout"),
        `#!/bin/sh\necho hooked > "${sentinel}"\n`,
        { mode: 0o755 },
      );
      process.env.GIT_TEMPLATE_DIR = template;

      const control = path.join(root, "control");
      runGit(root, ["clone", "-q", published.bare, control]);
      expect(fs.existsSync(sentinel)).toBe(true);
      fs.rmSync(sentinel);

      const result = await fetchSource({
        repository: "https://example.invalid/upstream.git",
        ref: "main",
        resolveRemote: resolveRemote(published.bare),
      });
      try {
        expect(fs.existsSync(sentinel)).toBe(false);
        expect(result.resolvedSha).toBe(published.sha);
      } finally {
        await result.cleanup();
      }
    } finally {
      if (previousTemplate === undefined) delete process.env.GIT_TEMPLATE_DIR;
      else process.env.GIT_TEMPLATE_DIR = previousTemplate;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a local checkout whose HEAD is absent from its declared remote", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-fetch-local-"));
    try {
      const published = publishRepo(root, "upstream");
      fs.writeFileSync(path.join(published.root, "README"), "local only\n");
      runGit(published.root, ["add", "README"]);
      runGit(published.root, ["commit", "-q", "-m", "not published"]);

      await expect(fetchSource({
        repository: published.root,
        ref: "HEAD",
      })).rejects.toThrow(/remote/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolves a branch ref to a 40-character lowercase SHA", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-fetch-sha-"));
    try {
      const published = publishRepo(root, "upstream");
      const result = await fetchSource({
        repository: "https://example.invalid/upstream.git",
        ref: "main",
        resolveRemote: resolveRemote(published.bare),
      });
      try {
        expect(result.resolvedSha).toMatch(SHA_PATTERN);
        expect(result.resolvedSha).toBe(published.sha);
        expect(result.repository).toBe("https://example.invalid/upstream.git");
        expect(fs.existsSync(result.gitDirectory)).toBe(true);
      } finally {
        await result.cleanup();
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a non-https remote", async () => {
    await expect(fetchSource({
      repository: "ssh://git@example.invalid/upstream.git",
      ref: "main",
    })).rejects.toThrow(/https/);

    await expect(fetchSource({
      repository: "git://example.invalid/upstream.git",
      ref: "main",
    })).rejects.toThrow(/https/);
  });

  test("cleanup removes the temp directory and is safe to call twice", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-fetch-cleanup-"));
    try {
      const published = publishRepo(root, "upstream");
      const result = await fetchSource({
        repository: "https://example.invalid/upstream.git",
        ref: "main",
        resolveRemote: resolveRemote(published.bare),
      });
      const directory = result.gitDirectory;
      expect(fs.existsSync(directory)).toBe(true);
      expect(path.resolve(directory).startsWith(path.resolve(root, ".."))).toBe(false);

      await result.cleanup();
      expect(fs.existsSync(directory)).toBe(false);
      await result.cleanup();
      expect(fs.existsSync(directory)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
