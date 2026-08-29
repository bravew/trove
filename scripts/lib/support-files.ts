/**
 * Names that must never enter a skill support-file copy or the upstream lock.
 * Running a vendored Python engine locally creates these next to source.
 */
export function isUnownedSupportName(name: string): boolean {
  return name === "__pycache__" || name === ".DS_Store" || name.endsWith(".pyc");
}
