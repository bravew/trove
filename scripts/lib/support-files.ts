/**
 * Names that must never enter a skill support-file copy or the upstream lock.
 * Running a vendored Python engine locally creates the bytecode, and installing
 * the Remotion composition creates `node_modules` next to its `package.json`.
 * Both are build products of a local run, not skill content.
 */
export function isUnownedSupportName(name: string): boolean {
  return name === "__pycache__"
    || name === ".DS_Store"
    || name === "node_modules"
    || name.endsWith(".pyc");
}
