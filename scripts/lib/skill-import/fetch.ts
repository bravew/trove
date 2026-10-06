import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FetchResult } from "./types";

const FULL_SHA = /^[0-9a-f]{40}$/;

export interface FetchRequest {
  repository: string;
  ref: string;
  /**
   * Resolves the declared repository to the remote git actually fetches.
   * The default accepts only https and returns it unchanged. Tests inject a
   * resolver that points at a local bare repository, so the clone never needs
   * the network and a local path never becomes a trust root.
   */
  resolveRemote?: (repository: string) => string;
}

interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runGit(cwd: string | undefined, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...args], {
      cwd,
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({
        status: status ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function git(cwd: string | undefined, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await runGit(cwd, args, env);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function defaultResolveRemote(repository: string): string {
  if (!repository.startsWith("https://")) {
    throw new Error(`refusing non-https remote: ${repository}`);
  }
  return repository;
}

function usesFileTransport(remote: string): boolean {
  return !remote.includes("://") || remote.startsWith("file://");
}

function assertSafeRef(ref: string): void {
  if (ref.startsWith("-") || ref.includes("\0") || ref.includes("\n")) {
    throw new Error(`refusing unsafe ref: ${ref}`);
  }
}

/**
 * A local path is a fast path, never a trust root: clean, and its HEAD is on
 * origin. Returns the origin URL, which is what provenance records.
 */
async function acceptLocalCheckout(repository: string): Promise<string> {
  if (!fs.statSync(repository, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`not an https remote or a local checkout: ${repository}`);
  }
  const top = await git(repository, ["rev-parse", "--show-toplevel"]);
  const checkout = await fs.promises.realpath(top);
  const requested = await fs.promises.realpath(repository);
  if (checkout !== requested) {
    throw new Error(`local path is not the root of a git checkout: ${repository}`);
  }
  const status = await git(checkout, ["-c", "core.fsmonitor=false", "status", "--porcelain"]);
  if (status !== "") {
    throw new Error(`local checkout is not clean: ${repository}`);
  }
  const head = await git(checkout, ["rev-parse", "--verify", "--end-of-options", "HEAD"]);
  const contained = await runGit(checkout, ["branch", "-r", "--contains", head]);
  if (contained.status !== 0 || !contained.stdout.split("\n").some((line) => line.trim().startsWith("origin/"))) {
    throw new Error(`local checkout HEAD is not present on its declared remote: ${repository}`);
  }
  const origin = await git(checkout, ["remote", "get-url", "origin"]);
  if (!origin.startsWith("https://")) {
    throw new Error(`local checkout remote is not https: ${repository}`);
  }
  return origin;
}

/**
 * Builds a checkout from a local git directory without a file-protocol fetch.
 * Git refuses every file transport under protocol.file.allow=never, including a
 * path clone, so the objects and refs are copied and the ref is checked out from
 * the copy. Used only for an injected resolver.
 */
async function materializeLocal(source: string, directory: string): Promise<void> {
  await git(undefined, ["init", "-q", "-b", "main", "--template=", directory]);
  await git(directory, ["config", "core.hooksPath", "/dev/null"]);
  await git(directory, ["config", "submodule.recurse", "false"]);
  const sourceGit = (await git(source, ["rev-parse", "--absolute-git-dir"])).trim();
  const destinationGit = path.join(directory, ".git");
  await fs.promises.cp(path.join(sourceGit, "objects"), path.join(destinationGit, "objects"), { recursive: true });
  const packedRefs = path.join(sourceGit, "packed-refs");
  if (fs.existsSync(packedRefs)) {
    await fs.promises.copyFile(packedRefs, path.join(destinationGit, "packed-refs"));
  }
  await copyRefs(path.join(sourceGit, "refs"), path.join(destinationGit, "refs"));
}

async function copyRefs(source: string, destination: string): Promise<void> {
  if (!fs.existsSync(source)) return;
  for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await fs.promises.mkdir(to, { recursive: true });
      await copyRefs(from, to);
    } else if (entry.isFile()) {
      await fs.promises.mkdir(destination, { recursive: true });
      await fs.promises.copyFile(from, to);
    }
  }
}

function resolvedCommit(output: string): string {
  const sha = output.trim().toLowerCase();
  if (!FULL_SHA.test(sha)) {
    throw new Error(`ref did not resolve to a full SHA: ${output.trim()}`);
  }
  return sha;
}

export async function fetchSource(request: FetchRequest): Promise<FetchResult> {
  assertSafeRef(request.ref);
  const resolveRemote = request.resolveRemote ?? defaultResolveRemote;
  const isLocal = !request.repository.includes("://");
  const declared = isLocal ? await acceptLocalCheckout(request.repository) : request.repository;
  const remote = resolveRemote(declared);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trove-skill-import-"));
  const cloneEnv = { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" };
  // protocol.allow=never also stops a redirect or submodule from leaving https.
  const cloneConfig = [
    "-c", "core.hooksPath=/dev/null",
    "-c", "protocol.allow=never",
    "-c", "protocol.https.allow=always",
    "-c", "protocol.file.allow=never",
    "-c", "submodule.recurse=false",
  ];
  try {
    if (usesFileTransport(remote)) {
      // An injected resolver may hand back a local bare repository, and
      // protocol.file.allow=never blocks every file transport including a path
      // clone. Its objects are copied in instead of fetched. The default
      // resolver never returns such a remote.
      await materializeLocal(remote, directory);
    } else {
      // A bare clone keeps every branch under refs/heads, so a non-default
      // branch name resolves the same way it does in materializeLocal. A plain
      // clone would leave it only under refs/remotes/origin.
      const gitDir = path.join(directory, ".git");
      await git(undefined, [...cloneConfig, "clone", "--bare", "--template=", "--config", "core.hooksPath=/dev/null", "--config", "submodule.recurse=false", "--", remote, gitDir], cloneEnv);
      await git(gitDir, ["config", "core.bare", "false"]);
    }
    const sha = resolvedCommit(await git(directory, ["rev-parse", "--verify", "--end-of-options", `${request.ref}^{commit}`]));
    if (isLocal) {
      const head = await git(request.repository, ["rev-parse", "--verify", "--end-of-options", "HEAD"]);
      if (head !== sha) {
        throw new Error(`local checkout HEAD is not the requested ref: ${request.repository}`);
      }
    }
    await git(directory, ["checkout", "--detach", "--quiet", sha], cloneEnv);
    const gitDirectory = await git(directory, ["rev-parse", "--absolute-git-dir"]);
    return {
      repository: declared,
      resolvedSha: sha,
      gitDirectory,
      cleanup: cleanupOf(directory),
    };
  } catch (error) {
    await removeDirectory(directory);
    throw error;
  }
}

function cleanupOf(directory: string): () => Promise<void> {
  let removed = false;
  return async () => {
    if (removed) return;
    removed = true;
    await removeDirectory(directory);
  };
}

async function removeDirectory(directory: string): Promise<void> {
  await fs.promises.rm(directory, { recursive: true, force: true });
}
