/**
 * Provenance validation for the privileged `workflow_run` writer.
 *
 * The writer checks out trusted default-branch code and consumes an artifact
 * produced by an unprivileged analyzer that ran against pull-request content.
 * GitHub is explicit that such an artifact is untrusted input, so every field
 * the writer acts on is re-derived from the live API and compared here before
 * a single comment is posted.
 */

export const WRITER_ARTIFACT_SCHEMA = "trove.external-analysis.v1" as const;

export interface AnalysisArtifact {
  schemaVersion: string;
  pullRequest: number;
  headRepository: string;
  headRef: string;
  headSha: string;
  baseSha: string;
  findings: unknown[];
}

export interface WorkflowRunContext {
  /** Workflow file name of the run that produced the artifact. */
  workflowPath: string;
  event: string;
  conclusion: string;
  headSha: string;
  headRepository: string;
}

export interface LivePullRequest {
  number: number;
  state: "open" | "closed";
  headRepository: string;
  headRef: string;
  headSha: string;
  baseSha: string;
}

export interface WriterExpectations {
  workflowPath: string;
  maximumArtifactBytes: number;
  baseRepository: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

export function validateWriterInput(
  artifact: unknown,
  artifactBytes: number,
  run: WorkflowRunContext,
  live: LivePullRequest | null,
  expected: WriterExpectations,
): string[] {
  const rejections: string[] = [];

  if (artifactBytes > expected.maximumArtifactBytes) {
    rejections.push(`artifact is ${artifactBytes} bytes, over the ${expected.maximumArtifactBytes} byte limit`);
  }
  if (run.workflowPath !== expected.workflowPath) {
    rejections.push(`unexpected producing workflow: ${run.workflowPath}`);
  }
  if (run.event !== "pull_request") {
    rejections.push(`unexpected producing event: ${run.event}`);
  }
  if (run.conclusion !== "success" && run.conclusion !== "failure") {
    rejections.push(`producing run did not complete with a reportable conclusion: ${run.conclusion}`);
  }

  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    rejections.push("artifact must be a JSON object");
    return rejections;
  }
  const value = artifact as Partial<AnalysisArtifact>;
  if (value.schemaVersion !== WRITER_ARTIFACT_SCHEMA) {
    rejections.push(`unexpected artifact schema: ${String(value.schemaVersion)}`);
  }
  if (!Number.isInteger(value.pullRequest) || (value.pullRequest as number) <= 0) {
    rejections.push(`invalid pull request number: ${String(value.pullRequest)}`);
  }
  if (!Array.isArray(value.findings)) {
    rejections.push("artifact findings must be an array");
  }
  for (const key of ["headSha", "baseSha"] as const) {
    if (typeof value[key] !== "string" || !FULL_SHA.test(value[key] as string)) {
      rejections.push(`artifact ${key} must be a full commit SHA`);
    }
  }

  // The artifact cannot vouch for itself. Every claim is compared against the
  // run metadata GitHub reports and the current state of the pull request.
  if (value.headSha !== run.headSha) {
    rejections.push("artifact headSha does not match the producing workflow run");
  }
  if (value.headRepository !== run.headRepository) {
    rejections.push("artifact headRepository does not match the producing workflow run");
  }

  if (!live) {
    rejections.push("pull request could not be resolved");
    return rejections;
  }
  if (live.number !== value.pullRequest) {
    rejections.push("artifact pull request number does not match the resolved pull request");
  }
  if (live.state !== "open") {
    rejections.push("pull request is no longer open");
  }
  if (live.headSha !== value.headSha) {
    rejections.push("pull request has advanced past the analyzed head SHA");
  }
  if (live.headRepository !== value.headRepository) {
    rejections.push("pull request head repository changed since analysis");
  }
  if (value.headRef !== undefined && live.headRef !== value.headRef) {
    rejections.push("pull request head ref changed since analysis");
  }
  if (live.baseSha !== value.baseSha) {
    rejections.push("pull request base has moved since analysis");
  }
  if (live.headRepository === expected.baseRepository && run.headRepository !== expected.baseRepository) {
    rejections.push("fork mismatch between the run and the pull request");
  }
  return rejections;
}

export const COMMENT_MARKER = "<!-- trove:external-plugin-analysis -->" as const;

/** Marker-delimited body so repeated writes update one comment instead of stacking. */
export function renderWriterComment(body: string): string {
  return `${COMMENT_MARKER}\n${body.trimEnd()}\n`;
}
