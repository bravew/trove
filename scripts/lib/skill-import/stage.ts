import type { ImportMode, ImportReport, Selection } from "./types";

export interface StageRequest {
  mode: ImportMode;
  id: string;
  plugin: string;
  category: string;
  selection: Selection;
  report: ImportReport;
  dryRun: boolean;
}

export async function stageImport(_request: StageRequest): Promise<void> {
  throw new Error("not implemented");
}
