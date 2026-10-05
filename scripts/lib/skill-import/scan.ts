import type { FetchResult, Finding, ProposedTransform, Selection } from "./types";

export interface ScanResult {
  findings: readonly Finding[];
  proposedTransforms: readonly ProposedTransform[];
}

export async function scanSource(
  _source: FetchResult,
  _selection: Selection,
): Promise<ScanResult> {
  throw new Error("not implemented");
}
