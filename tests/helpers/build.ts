import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

const ROOT = path.resolve(import.meta.dir, "..", "..");
const LOCK_DIR = path.join(os.tmpdir(), "trove-test-build.lock");
const STAMP = path.join(os.tmpdir(), "trove-test-build.stamp");

function sleep(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(50, end - Date.now()));
  }
}

function stampIsFresh(startedAt: number): boolean {
  try {
    return fs.statSync(STAMP).mtimeMs >= startedAt;
  } catch {
    return false;
  }
}

export function buildOnceForTests(): void {
  const startedAt = Number(process.env.TROVE_TEST_BUILD_STARTED_AT ?? Date.now());
  process.env.TROVE_TEST_BUILD_STARTED_AT = String(startedAt);

  if (stampIsFresh(startedAt)) return;

  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      fs.mkdirSync(LOCK_DIR);
      break;
    } catch {
      if (stampIsFresh(startedAt)) return;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for test build lock: ${LOCK_DIR}`);
      }
      sleep(100);
    }
  }

  try {
    if (stampIsFresh(startedAt)) return;
    const result = spawnSync("bun", ["run", "build"], { cwd: ROOT, stdio: "pipe" });
    if (result.status !== 0) {
      throw new Error(`build failed:\n${result.stderr?.toString() ?? ""}`);
    }
    fs.writeFileSync(STAMP, String(Date.now()));
  } finally {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}
