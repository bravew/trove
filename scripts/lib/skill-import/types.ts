export type ImportMode = "vendored" | "adapted";

export interface FetchResult {
  repository: string;
  resolvedSha: string;
  gitDirectory: string;
  cleanup: () => Promise<void>;
}

export interface Selection {
  include: readonly string[];
  exclude: readonly string[];
  pathMap: Readonly<Record<string, string>>;
}

export interface Finding {
  severity: "hard-reject" | "flag";
  file: string;
  line: number;
  message: string;
}

export interface ProposedTransform {
  kind: "replace-literal";
  path: string;
  from: string;
  to: string;
  minimumOccurrences: number;
}

export interface ImportReport {
  mode: ImportMode;
  source: FetchResult;
  findings: readonly Finding[];
  proposedTransforms: readonly ProposedTransform[];
}
