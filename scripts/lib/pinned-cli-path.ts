import * as path from "node:path";

/**
 * The inherited PATH with the repository's own `node_modules/.bin` removed.
 *
 * `bun run` prepends `node_modules/.bin`, and `@microsoft/vally-cli` pulls in its
 * own `@github/copilot` there. Resolving `copilot` on the inherited PATH would
 * silently run that transitive copy instead of the pinned CLI the workflows
 * install globally, so every spawn that means the pinned CLI resolves against
 * this PATH instead. `tests/acceptance/copilot-install-smoke.sh` does the same in
 * shell.
 */
export function pathWithoutLocalBin(root: string, inherited: string = process.env.PATH ?? ""): string {
  const localBin = path.join(root, "node_modules", ".bin");
  return inherited
    .split(path.delimiter)
    .filter((entry) => entry !== localBin)
    .join(path.delimiter);
}
