/** The edit plan, as references/edit-plan.schema.json defines it. */
export interface Beat {
  kind: "caption" | "title" | "callout" | "stat" | "quote" | "comparison" | "list" | "image" | "zoom";
  start: number;
  end: number;
  anchor: string;
  reason: string;
  text?: string;
  asset?: string;
}

export interface EditPlan {
  source: string;
  mode: "shorts" | "intro" | "longform";
  music?: string;
  beats: Beat[];
}
