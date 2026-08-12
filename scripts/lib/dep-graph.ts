/**
 * Skill dependency graph helpers.
 *
 * The graph is **advisory** — `benefits-from` declarations don't drive
 * execution. These helpers exist so the build artifact (`deps.json`) and
 * the validator (`validate.ts`) share one cycle-detection implementation.
 */

/**
 * Detect cycles in a directed graph keyed by node name. Each returned
 * cycle is the path through the cycle starting and ending at the same
 * node. Two rotations of the same cycle are reported once.
 *
 * Implementation: three-color DFS.
 *   - white (default) → never visited
 *   - gray  (in `pathSoFar`) → currently on the DFS stack
 *   - black (in `fullyExplored`) → finished; descendants fully checked
 *
 * The black set keeps overall complexity at O(|V| + |E|). Without it, a
 * funnel-shaped DAG (many paths converging on a sink) re-explores the
 * sink's subgraph from every entry point, blowing up exponentially. A
 * cycle is only reported when we encounter a gray node — black nodes are
 * already known cycle-clear from prior DFS, so we safely skip them.
 */
export function detectCycles(forward: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const seenKeys = new Set<string>();
  const fullyExplored = new Set<string>();

  function dfs(node: string, pathSoFar: string[]): void {
    if (fullyExplored.has(node)) return; // black — descendants already checked

    const idx = pathSoFar.indexOf(node);
    if (idx !== -1) {
      // gray — node is on the current stack, so we've found a cycle.
      const cycle = pathSoFar.slice(idx).concat(node);
      // Normalize by the unique-node set; the raw cycle has a trailing
      // duplicate start node by construction, so sorting the raw array
      // doesn't canonicalize across different DFS starting points.
      const key = [...new Set(cycle)].sort().join("|");
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        cycles.push(cycle);
      }
      return;
    }

    // white — explore children, then mark this node black.
    const next = forward.get(node) ?? [];
    const newPath = [...pathSoFar, node];
    for (const m of next) dfs(m, newPath);
    fullyExplored.add(node);
  }

  for (const start of forward.keys()) dfs(start, []);
  return cycles;
}

/** Build a forward dependency map from a list of (skill, benefitsFrom) tuples. */
export function buildForwardGraph(
  skills: Array<{ name: string; benefitsFrom: string[] }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of skills) map.set(s.name, [...s.benefitsFrom]);
  return map;
}
