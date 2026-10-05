import type { FetchResult } from "./types";

export interface FetchRequest {
  repository: string;
  ref: string;
}

export async function fetchSource(_request: FetchRequest): Promise<FetchResult> {
  throw new Error("not implemented");
}
