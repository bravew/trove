import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";

export type FullSha = string & { readonly __brand: "ExternalFullSha" };
export type IsoDate = string & { readonly __brand: "ExternalIsoDate" };

/**
 * Who has to act on a finding. Keeping this on the finding rather than
 * inferring it from an exit code is what lets intake tell a submitter "fix
 * your record" apart from "our runner failed", which the sample repository
 * collapses into one red check.
 */
export type FindingAudience = "submitter" | "maintainer" | "infrastructure";

export interface ExternalFinding {
  rule: string;
  audience: FindingAudience;
  message: string;
}

export interface ExternalPolicy {
  schemaVersion: "trove.external-policy.v1";
  allowedHosts: readonly string[];
  allowedLicenses: readonly string[];
  allowedComponents: readonly string[];
  prohibitedComponents: readonly string[];
  reviewIntervalDays: number;
  sandbox: {
    maximumCloneBytes: number;
    maximumFileCount: number;
    maximumFileBytes: number;
    cloneTimeoutSeconds: number;
    installTimeoutSeconds: number;
  };
}

export type Disposition = "proposed" | "needs-changes" | "approved" | "rejected" | "removed";

export const DISPOSITIONS: readonly Disposition[] = [
  "proposed",
  "needs-changes",
  "approved",
  "rejected",
  "removed",
];

export interface ExternalReview {
  disposition: Disposition;
  reviewer: string | null;
  revision: FullSha | null;
  reviewedAt: IsoDate | null;
  nextReviewAt: IsoDate | null;
  note: string | null;
}

export interface ExternalPluginRecord {
  schemaVersion: "trove.external-plugin.v1";
  name: string;
  description: string;
  submitter: string;
  source: {
    host: string;
    repository: string;
    subdirectory: string;
    sha: FullSha;
  };
  license: { expression: string; evidence: string };
  components: readonly string[];
  review: ExternalReview;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PLUGIN_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isFullSha(value: unknown): value is FullSha {
  return typeof value === "string" && FULL_SHA.test(value);
}

/**
 * A subdirectory must stay inside the cloned tree. `..` is the obvious case;
 * an absolute path and a leading `~` matter too because the value is joined
 * against the sandbox root before the Copilot install runs.
 */
export function isContainedSubdirectory(candidate: string): boolean {
  if (candidate === ".") return true;
  if (candidate.startsWith("/") || candidate.startsWith("~") || candidate.includes("\\")) return false;
  if (candidate.split("/").some((segment) => segment === ".." || segment === "" || segment === ".")) return false;
  return !path.posix.normalize(candidate).startsWith("..");
}

export function addDays(from: IsoDate, days: number): IsoDate {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString() as IsoDate;
}

export function nextReviewDate(reviewedAt: IsoDate, policy: ExternalPolicy): IsoDate {
  return addDays(reviewedAt, policy.reviewIntervalDays);
}

export function isReviewStale(record: ExternalPluginRecord, now: IsoDate): boolean {
  if (record.review.disposition !== "approved") return false;
  if (!record.review.nextReviewAt) return true;
  return Date.parse(record.review.nextReviewAt) <= Date.parse(now);
}

function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.endsWith("Z");
}

export function parsePolicy(file: string): ExternalPolicy {
  const parsed = YAML.parse(fs.readFileSync(file, "utf-8")) as Partial<ExternalPolicy>;
  if (parsed.schemaVersion !== "trove.external-policy.v1") {
    throw new Error(`unsupported external policy schema: ${String(parsed.schemaVersion)}`);
  }
  for (const key of ["allowedHosts", "allowedLicenses", "allowedComponents", "prohibitedComponents"] as const) {
    if (!Array.isArray(parsed[key]) || parsed[key]!.length === 0) throw new Error(`external policy: ${key} must be a non-empty list`);
  }
  if (typeof parsed.reviewIntervalDays !== "number" || parsed.reviewIntervalDays <= 0) {
    throw new Error("external policy: reviewIntervalDays must be a positive number");
  }
  const sandbox = parsed.sandbox;
  if (!sandbox) throw new Error("external policy: sandbox is required");
  for (const key of ["maximumCloneBytes", "maximumFileCount", "maximumFileBytes", "cloneTimeoutSeconds", "installTimeoutSeconds"] as const) {
    if (typeof sandbox[key] !== "number" || sandbox[key] <= 0) throw new Error(`external policy: sandbox.${key} must be a positive number`);
  }
  const overlap = parsed.allowedComponents!.filter((component) => parsed.prohibitedComponents!.includes(component));
  if (overlap.length > 0) throw new Error(`external policy: component both allowed and prohibited: ${overlap.join(", ")}`);
  return parsed as ExternalPolicy;
}

/**
 * Parsing never throws on record content: an unreadable record is a submitter
 * finding, so intake can report it on the pull request instead of failing the
 * job with a stack trace that looks like an infrastructure problem.
 */
export function parseRecord(file: string): { record: ExternalPluginRecord | null; findings: ExternalFinding[] } {
  let parsed: unknown;
  try {
    parsed = YAML.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    return {
      record: null,
      findings: [{ rule: "record-parse", audience: "submitter", message: `${path.basename(file)}: ${(error as Error).message}` }],
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { record: null, findings: [{ rule: "record-parse", audience: "submitter", message: `${path.basename(file)}: record must be a mapping` }] };
  }
  return { record: parsed as ExternalPluginRecord, findings: [] };
}

export function validateRecord(
  record: ExternalPluginRecord,
  policy: ExternalPolicy,
  options: { fileName: string; now: IsoDate },
): ExternalFinding[] {
  const findings: ExternalFinding[] = [];
  const submitter = (rule: string, message: string): void => {
    findings.push({ rule, audience: "submitter", message });
  };
  const maintainer = (rule: string, message: string): void => {
    findings.push({ rule, audience: "maintainer", message });
  };

  if (record.schemaVersion !== "trove.external-plugin.v1") {
    submitter("schema-version", `unsupported record schema: ${String(record.schemaVersion)}`);
  }
  if (typeof record.name !== "string" || !PLUGIN_NAME.test(record.name)) {
    submitter("plugin-name", `name must be lowercase kebab-case: ${String(record.name)}`);
  } else if (options.fileName !== `${record.name}.yaml`) {
    submitter("record-filename", `record for '${record.name}' must be named ${record.name}.yaml, found ${options.fileName}`);
  }
  if (typeof record.description !== "string" || record.description.trim().length < 10) {
    submitter("description", "description must be at least 10 characters");
  }
  if (typeof record.submitter !== "string" || record.submitter.trim() === "") {
    submitter("submitter", "submitter is required");
  }

  const source = record.source;
  if (!source || typeof source !== "object") {
    submitter("source", "source is required");
  } else {
    if (!policy.allowedHosts.includes(source.host)) {
      submitter("source-host", `host not allowed by policy: ${String(source.host)}`);
    }
    if (typeof source.repository !== "string" || !REPOSITORY.test(source.repository)) {
      submitter("source-repository", `repository must be owner/name: ${String(source.repository)}`);
    }
    if (typeof source.subdirectory !== "string" || !isContainedSubdirectory(source.subdirectory)) {
      submitter("source-subdirectory", `subdirectory escapes the clone: ${String(source.subdirectory)}`);
    }
    if (!isFullSha(source.sha)) {
      submitter("source-sha", `source.sha must be an exact 40-character commit SHA, found: ${String(source.sha)}`);
    }
  }

  if (!record.license || typeof record.license !== "object") {
    submitter("license", "license is required");
  } else {
    if (!policy.allowedLicenses.includes(record.license.expression)) {
      submitter("license-expression", `license not allowed by policy: ${String(record.license.expression)}`);
    }
    if (typeof record.license.evidence !== "string" || !isContainedSubdirectory(record.license.evidence.replace(/\/[^/]*$/, "") || ".")) {
      submitter("license-evidence", `license.evidence must be a path inside the source repository: ${String(record.license.evidence)}`);
    }
  }

  if (!Array.isArray(record.components) || record.components.length === 0) {
    submitter("components", "components must list at least one declared component type");
  } else {
    for (const component of record.components) {
      if (policy.prohibitedComponents.includes(component)) {
        submitter("component-prohibited", `component type is prohibited by policy: ${component}`);
      } else if (!policy.allowedComponents.includes(component)) {
        submitter("component-unknown", `component type is not in the policy allowlist: ${component}`);
      }
    }
  }

  const review = record.review;
  if (!review || typeof review !== "object") {
    submitter("review", "review block is required");
    return findings;
  }
  if (!DISPOSITIONS.includes(review.disposition)) {
    submitter("review-disposition", `unknown disposition: ${String(review.disposition)}`);
  }
  if (review.disposition === "proposed") {
    if (review.reviewedAt || review.reviewer || review.revision) {
      submitter("review-proposed", "a proposed record must not claim a reviewer, revision, or review date");
    }
  }
  if (review.disposition === "approved") {
    if (!review.reviewer) maintainer("review-reviewer", "an approved record must name the reviewer");
    if (!isFullSha(review.revision)) {
      maintainer("review-revision", "an approved record must pin the exact reviewed 40-character revision");
    } else if (isFullSha(record.source?.sha) && review.revision !== record.source.sha) {
      submitter("review-revision-drift", `source.sha ${record.source.sha} was never reviewed; approved revision is ${review.revision}`);
    }
    if (!isIsoDate(review.reviewedAt)) {
      maintainer("review-reviewed-at", "an approved record must carry an ISO reviewedAt timestamp");
    } else if (!isIsoDate(review.nextReviewAt)) {
      maintainer("review-next-review-at", "an approved record must carry an explicit nextReviewAt timestamp");
    } else {
      const expected = nextReviewDate(review.reviewedAt, policy);
      if (review.nextReviewAt !== expected) {
        maintainer("review-interval", `nextReviewAt must be reviewedAt plus ${policy.reviewIntervalDays} days (${expected})`);
      }
      if (isReviewStale(record, options.now)) {
        maintainer("review-stale", `review expired on ${review.nextReviewAt}; run the re-review command`);
      }
    }
  }
  return findings;
}

export interface CommandOutcome {
  record: ExternalPluginRecord | null;
  findings: ExternalFinding[];
}

export type ReviewCommand = "approve" | "needs-changes" | "reject" | "keep" | "remove";

const TRANSITIONS: Readonly<Record<ReviewCommand, readonly Disposition[]>> = {
  approve: ["proposed", "needs-changes"],
  "needs-changes": ["proposed", "approved"],
  reject: ["proposed", "needs-changes"],
  keep: ["approved"],
  remove: ["approved", "needs-changes", "rejected"],
};

const RESULT: Readonly<Record<ReviewCommand, Disposition>> = {
  approve: "approved",
  "needs-changes": "needs-changes",
  reject: "rejected",
  keep: "approved",
  remove: "removed",
};

/**
 * State transitions live here, not in workflow expressions. Applying the same
 * command twice converges: `keep` on an already-current approval rewrites the
 * same reviewedAt window rather than stacking a second one.
 */
export function applyCommand(
  record: ExternalPluginRecord,
  command: ReviewCommand,
  actor: string,
  now: IsoDate,
  policy: ExternalPolicy,
): CommandOutcome {
  if (!TRANSITIONS[command]) {
    return { record: null, findings: [{ rule: "command-unknown", audience: "maintainer", message: `unknown command: ${String(command)}` }] };
  }
  const from = record.review.disposition;
  if (!TRANSITIONS[command].includes(from)) {
    return {
      record: null,
      findings: [{
        rule: "command-transition",
        audience: "maintainer",
        message: `cannot ${command} a record in disposition '${from}'; allowed from ${TRANSITIONS[command].join(", ")}`,
      }],
    };
  }
  if ((command === "approve" || command === "keep") && !isFullSha(record.source?.sha)) {
    return {
      record: null,
      findings: [{ rule: "command-revision", audience: "submitter", message: "cannot approve a record without an exact 40-character source.sha" }],
    };
  }

  const disposition = RESULT[command];
  const review: ExternalReview =
    disposition === "approved"
      ? {
          disposition,
          reviewer: actor,
          revision: record.source.sha,
          reviewedAt: now,
          nextReviewAt: nextReviewDate(now, policy),
          note: record.review.note ?? null,
        }
      : {
          disposition,
          reviewer: actor,
          revision: record.review.revision ?? null,
          reviewedAt: now,
          nextReviewAt: null,
          note: record.review.note ?? null,
        };
  return { record: { ...record, review }, findings: [] };
}

export function serializeRecord(record: ExternalPluginRecord): string {
  return YAML.stringify(record, { lineWidth: 0 });
}

export function listRecordFiles(root: string): string[] {
  const dir = path.join(root, "external", "plugins");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map((file) => path.join(dir, file));
}

/**
 * Manifest inspection, kept pure so the intake fixtures can exercise it
 * without a network clone. The gate script reads the file and hands the
 * parsed object here.
 */
export function inspectManifest(
  manifest: Record<string, unknown>,
  record: ExternalPluginRecord,
  policy: ExternalPolicy,
): ExternalFinding[] {
  const findings: ExternalFinding[] = [];
  if (manifest.name !== record.name) {
    findings.push({
      rule: "manifest-name",
      audience: "submitter",
      message: `manifest name '${String(manifest.name)}' does not match the record name '${record.name}'`,
    });
  }
  for (const component of policy.prohibitedComponents) {
    if (component in manifest) {
      findings.push({ rule: "manifest-prohibited-component", audience: "submitter", message: `manifest declares a prohibited component: ${component}` });
    }
  }
  for (const declared of record.components) {
    if (!(declared in manifest)) {
      findings.push({ rule: "manifest-component-undeclared", audience: "submitter", message: `record declares '${declared}' but the manifest does not` });
    }
  }
  return findings;
}

export interface InstallStep {
  step: "marketplace-add" | "install" | "list";
  ok: boolean;
  output: string;
}

/**
 * Splits a failed Copilot install into "the plugin is broken" and "our runner
 * is broken". Marketplace setup and inventory listing are Trove's own
 * scaffolding, so their failures are infrastructure; the install itself and a
 * missing inventory entry are the submitter's.
 */
export function classifyInstallOutcome(steps: readonly InstallStep[], pluginName: string): ExternalFinding[] {
  for (const step of steps) {
    if (step.ok) continue;
    if (step.step === "install") {
      return [{ rule: "install-failed", audience: "submitter", message: `copilot plugin install failed: ${step.output}` }];
    }
    return [{ rule: `install-${step.step}`, audience: "infrastructure", message: `${step.step} failed: ${step.output}` }];
  }
  const listed = steps.find((step) => step.step === "list");
  if (!listed) {
    return [{ rule: "install-inventory", audience: "infrastructure", message: "install smoke did not produce an inventory listing" }];
  }
  if (!listed.output.includes(pluginName)) {
    return [{ rule: "install-inventory-mismatch", audience: "submitter", message: `${pluginName} did not appear in the installed inventory` }];
  }
  return [];
}

/**
 * Pulls the record out of an intake issue body. Issue bodies are untrusted
 * text, so the only thing read is the first fenced `yaml` block, and it is
 * bounded before parsing.
 */
export function extractIssueRecord(body: string, maximumBytes = 65536): { yaml: string | null; findings: ExternalFinding[] } {
  if (Buffer.byteLength(body, "utf-8") > maximumBytes) {
    return { yaml: null, findings: [{ rule: "intake-body-bytes", audience: "submitter", message: `issue body exceeds ${maximumBytes} bytes` }] };
  }
  const match = body.match(/```ya?ml\s*\n([\s\S]*?)\n```/);
  if (!match) {
    return {
      yaml: null,
      findings: [{ rule: "intake-block-missing", audience: "submitter", message: "issue body must contain one fenced ```yaml block holding the plugin record" }],
    };
  }
  return { yaml: match[1], findings: [] };
}

export function parseRecordText(text: string): { record: ExternalPluginRecord | null; findings: ExternalFinding[] } {
  try {
    const parsed = YAML.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { record: null, findings: [{ rule: "record-parse", audience: "submitter", message: "record must be a mapping" }] };
    }
    return { record: parsed as ExternalPluginRecord, findings: [] };
  } catch (error) {
    return { record: null, findings: [{ rule: "record-parse", audience: "submitter", message: (error as Error).message }] };
  }
}
