import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import YAML from "yaml";
import {
  applyCommand,
  classifyInstallOutcome,
  inspectManifest,
  isContainedSubdirectory,
  isReviewStale,
  listRecordFiles,
  nextReviewDate,
  parsePolicy,
  parseRecord,
  serializeRecord,
  validateRecord,
  type ExternalPluginRecord,
  type IsoDate,
} from "../scripts/lib/external-plugin";
import {
  renderWriterComment,
  validateWriterInput,
  WRITER_ARTIFACT_SCHEMA,
  type LivePullRequest,
  type WorkflowRunContext,
} from "../scripts/lib/writer-provenance";

const ROOT = path.resolve(import.meta.dir, "..");
const FIXTURES = path.join(ROOT, "tests", "fixtures", "external-plugins");
const policy = parsePolicy(path.join(ROOT, "external", "policy.yaml"));
const NOW = "2026-09-09T00:00:00.000Z" as IsoDate;

function fixture(name: string): ExternalPluginRecord {
  const { record, findings } = parseRecord(path.join(FIXTURES, `${name}.yaml`));
  expect(findings).toEqual([]);
  return record!;
}

function check(name: string, now: IsoDate = NOW) {
  const record = fixture(name);
  return validateRecord(record, policy, { fileName: `${record.name}.yaml`, now });
}

describe("external intake policy", () => {
  test("pins an explicit review interval and sandbox bounds", () => {
    expect(policy.reviewIntervalDays).toBe(183);
    expect(policy.allowedHosts).toEqual(["github.com"]);
    expect(policy.prohibitedComponents).toContain("hooks");
    expect(policy.prohibitedComponents).toContain("mcpServers");
    expect(policy.sandbox.cloneTimeoutSeconds).toBeGreaterThan(0);
  });

  test("rejects a policy that both allows and prohibits a component", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "policy-")), "policy.yaml");
    fs.writeFileSync(file, fs.readFileSync(path.join(ROOT, "external", "policy.yaml"), "utf-8").replace("  - skills\n  - agents", "  - skills\n  - hooks"));
    expect(() => parsePolicy(file)).toThrow(/both allowed and prohibited/);
  });

  test("admits no external plugin until a record is committed", () => {
    // Decision 4 keeps the catalog first-party. The machinery exists; the
    // registry is deliberately empty, so this gate is a no-op until a record
    // lands with maintainer approval.
    expect(listRecordFiles(ROOT)).toEqual([]);
  });
});

describe("external record validation", () => {
  test("accepts a fully reviewed record", () => {
    expect(check("valid")).toEqual([]);
  });

  test("rejects a mutable ref in place of an immutable revision", () => {
    const rules = check("mutable-ref").map((finding) => finding.rule);
    expect(rules).toContain("source-sha");
    expect(check("mutable-ref").every((finding) => finding.audience === "submitter")).toBe(true);
  });

  test("rejects a license outside the policy allowlist", () => {
    expect(check("missing-license").map((finding) => finding.rule)).toContain("license-expression");
  });

  test("rejects a subdirectory that escapes the clone", () => {
    expect(check("malicious-path").map((finding) => finding.rule)).toContain("source-subdirectory");
    expect(isContainedSubdirectory("../../../etc")).toBe(false);
    expect(isContainedSubdirectory("/etc")).toBe(false);
    expect(isContainedSubdirectory("~/x")).toBe(false);
    expect(isContainedSubdirectory("plugins/example")).toBe(true);
    expect(isContainedSubdirectory(".")).toBe(true);
  });

  test("rejects a prohibited component type", () => {
    expect(check("prohibited-component").map((finding) => finding.rule)).toContain("component-prohibited");
  });

  test("reports an expired review to the maintainer, not the submitter", () => {
    const findings = check("stale-review");
    const stale = findings.find((finding) => finding.rule === "review-stale");
    expect(stale?.audience).toBe("maintainer");
    expect(isReviewStale(fixture("stale-review"), NOW)).toBe(true);
    expect(isReviewStale(fixture("valid"), NOW)).toBe(false);
  });

  test("rejects an approval whose source moved past the reviewed revision", () => {
    const record = fixture("valid");
    const drifted = { ...record, source: { ...record.source, sha: "2".repeat(40) as ExternalPluginRecord["source"]["sha"] } };
    expect(validateRecord(drifted, policy, { fileName: "example-skills.yaml", now: NOW }).map((finding) => finding.rule))
      .toContain("review-revision-drift");
  });

  test("rejects a record filename that does not match its plugin name", () => {
    expect(validateRecord(fixture("valid"), policy, { fileName: "other.yaml", now: NOW }).map((finding) => finding.rule))
      .toContain("record-filename");
  });

  test("reports an unreadable record as a submitter finding rather than throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "record-"));
    const file = path.join(dir, "broken.yaml");
    fs.writeFileSync(file, "name: [unterminated\n");
    const { record, findings } = parseRecord(file);
    expect(record).toBeNull();
    expect(findings[0]?.audience).toBe("submitter");
  });
});

describe("review state machine", () => {
  const proposed = (): ExternalPluginRecord => ({
    ...fixture("valid"),
    review: { disposition: "proposed", reviewer: null, revision: null, reviewedAt: null, nextReviewAt: null, note: null },
  });

  test("approve stamps the reviewer, reviewed revision, and explicit next review date", () => {
    const outcome = applyCommand(proposed(), "approve", "example-maintainer", NOW, policy);
    expect(outcome.findings).toEqual([]);
    expect(outcome.record?.review.disposition).toBe("approved");
    expect(outcome.record?.review.revision).toBe(proposed().source.sha);
    expect(outcome.record?.review.nextReviewAt).toBe(nextReviewDate(NOW, policy));
    expect(validateRecord(outcome.record!, policy, { fileName: "example-skills.yaml", now: NOW })).toEqual([]);
  });

  test("keep refreshes an approval window without stacking a second one", () => {
    const later = "2027-01-01T00:00:00.000Z" as IsoDate;
    const once = applyCommand(fixture("stale-review"), "keep", "example-maintainer", later, policy).record!;
    const twice = applyCommand(once, "keep", "example-maintainer", later, policy).record!;
    expect(serializeRecord(twice)).toBe(serializeRecord(once));
    expect(isReviewStale(twice, later)).toBe(false);
  });

  test("needs-changes moves an approved record back and clears its review window", () => {
    const outcome = applyCommand(fixture("valid"), "needs-changes", "example-maintainer", NOW, policy);
    expect(outcome.record?.review.disposition).toBe("needs-changes");
    expect(outcome.record?.review.nextReviewAt).toBeNull();
  });

  test("remove is terminal and idempotent from any reviewed state", () => {
    const removed = applyCommand(fixture("valid"), "remove", "example-maintainer", NOW, policy).record!;
    expect(removed.review.disposition).toBe("removed");
    expect(applyCommand(removed, "remove", "example-maintainer", NOW, policy).record).toBeNull();
  });

  test("rejects a transition the state machine does not allow", () => {
    const outcome = applyCommand(proposed(), "keep", "example-maintainer", NOW, policy);
    expect(outcome.record).toBeNull();
    expect(outcome.findings[0]?.rule).toBe("command-transition");
  });

  test("refuses to approve a record without an exact revision", () => {
    const outcome = applyCommand(fixture("mutable-ref"), "approve", "example-maintainer", NOW, policy);
    expect(outcome.record).toBeNull();
    expect(outcome.findings[0]?.audience).toBe("submitter");
  });
});

describe("install and manifest classification", () => {
  test("separates a broken plugin from a broken runner", () => {
    const install = classifyInstallOutcome(
      [{ step: "marketplace-add", ok: true, output: "" }, { step: "install", ok: false, output: "manifest rejected" }],
      "example-skills",
    );
    expect(install[0]?.audience).toBe("submitter");

    const infrastructure = classifyInstallOutcome(
      [{ step: "marketplace-add", ok: false, output: "network unreachable" }],
      "example-skills",
    );
    expect(infrastructure[0]?.audience).toBe("infrastructure");
  });

  test("treats a missing inventory entry as a submitter failure", () => {
    const findings = classifyInstallOutcome([
      { step: "marketplace-add", ok: true, output: "" },
      { step: "install", ok: true, output: "" },
      { step: "list", ok: true, output: "some-other-plugin 1.0.0" },
    ], "example-skills");
    expect(findings[0]?.rule).toBe("install-inventory-mismatch");
  });

  test("passes a clean install", () => {
    expect(classifyInstallOutcome([
      { step: "marketplace-add", ok: true, output: "" },
      { step: "install", ok: true, output: "" },
      { step: "list", ok: true, output: "example-skills 1.0.0" },
    ], "example-skills")).toEqual([]);
  });

  test("flags a manifest that declares a prohibited component", () => {
    const rules = inspectManifest({ name: "example-skills", skills: "./skills", hooks: "./hooks.json" }, fixture("valid"), policy)
      .map((finding) => finding.rule);
    expect(rules).toContain("manifest-prohibited-component");
  });

  test("flags a manifest whose name does not match the record", () => {
    const rules = inspectManifest({ name: "something-else", skills: "./skills" }, fixture("valid"), policy)
      .map((finding) => finding.rule);
    expect(rules).toContain("manifest-name");
  });
});

describe("privileged writer provenance", () => {
  const run: WorkflowRunContext = {
    workflowPath: ".github/workflows/external-plugin-pr-quality-gates.yml",
    event: "pull_request",
    conclusion: "success",
    headSha: "a".repeat(40),
    headRepository: "someone/fork",
  };
  const live: LivePullRequest = {
    number: 42,
    state: "open",
    headRepository: "someone/fork",
    headRef: "add-plugin",
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
  };
  const artifact = {
    schemaVersion: WRITER_ARTIFACT_SCHEMA,
    pullRequest: 42,
    headRepository: "someone/fork",
    headRef: "add-plugin",
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    findings: [],
  };
  const expectations = {
    workflowPath: ".github/workflows/external-plugin-pr-quality-gates.yml",
    maximumArtifactBytes: 262144,
    baseRepository: "bravew/trove",
  };

  test("accepts an artifact that matches the run and the live pull request", () => {
    expect(validateWriterInput(artifact, 2048, run, live, expectations)).toEqual([]);
  });

  test("rejects an artifact analyzed against a stale head SHA", () => {
    const advanced = { ...live, headSha: "c".repeat(40) };
    expect(validateWriterInput(artifact, 2048, run, advanced, expectations))
      .toContain("pull request has advanced past the analyzed head SHA");
  });

  test("rejects an artifact from an unexpected workflow", () => {
    const forged = { ...run, workflowPath: ".github/workflows/attacker.yml" };
    expect(validateWriterInput(artifact, 2048, forged, live, expectations).join("|")).toContain("unexpected producing workflow");
  });

  test("rejects an artifact that outgrew the size limit", () => {
    expect(validateWriterInput(artifact, 1024 * 1024, run, live, expectations).join("|")).toContain("over the");
  });

  test("rejects a closed pull request and an unresolvable one", () => {
    expect(validateWriterInput(artifact, 2048, run, { ...live, state: "closed" }, expectations))
      .toContain("pull request is no longer open");
    expect(validateWriterInput(artifact, 2048, run, null, expectations)).toContain("pull request could not be resolved");
  });

  test("rejects a schema the writer does not understand", () => {
    expect(validateWriterInput({ ...artifact, schemaVersion: "v0" }, 2048, run, live, expectations).join("|"))
      .toContain("unexpected artifact schema");
  });

  test("rejects an invalid pull request number and a moved base", () => {
    expect(validateWriterInput({ ...artifact, pullRequest: 0 }, 2048, run, live, expectations).join("|"))
      .toContain("invalid pull request number");
    expect(validateWriterInput(artifact, 2048, run, { ...live, baseSha: "d".repeat(40) }, expectations))
      .toContain("pull request base has moved since analysis");
  });

  test("writes one marker-delimited comment body", () => {
    const body = renderWriterComment("findings");
    expect(body.startsWith("<!-- trove:external-plugin-analysis -->")).toBe(true);
    expect(renderWriterComment("findings\n\n")).toBe(body);
  });
});

describe("external plugin workflow policy", () => {
  const load = (name: string) =>
    YAML.parse(fs.readFileSync(path.join(ROOT, ".github", "workflows", `${name}.yml`), "utf-8")) as Record<string, any>;
  const analyzer = load("external-plugin-pr-quality-gates");
  const writer = load("external-plugin-pr-quality-gates-writer");
  const intake = load("external-plugin-intake");
  const router = load("external-plugin-command-router");
  const rereview = load("external-plugin-rereview");
  const all = { analyzer, writer, intake, router, rereview };

  test("pins every action to a full commit SHA", () => {
    for (const workflow of Object.values(all)) {
      for (const job of Object.values(workflow.jobs as Record<string, any>)) {
        for (const step of job.steps as Record<string, unknown>[]) {
          if (typeof step.uses !== "string") continue;
          expect(step.uses).toMatch(/^[^@]+@[0-9a-f]{40}$/);
        }
      }
    }
  });

  test("keeps the analyzer unprivileged and secret-free", () => {
    expect(analyzer.permissions).toEqual({ contents: "read" });
    expect(analyzer.jobs["external-gate"].permissions).toEqual({ contents: "read" });
    const serialized = JSON.stringify(analyzer);
    // No secret of any kind reaches the job that clones untrusted plugins.
    expect(serialized).not.toContain("secrets.");
    expect(serialized).not.toContain("GH_TOKEN");
    expect(serialized).not.toContain("ANTHROPIC");
    expect(serialized).toContain("persist-credentials");
    expect(serialized).toContain("--with-clone");
  });

  test("keeps infrastructure failures out of the submitter's result", () => {
    expect(JSON.stringify(analyzer)).toContain("75");
    expect(JSON.stringify(intake)).toContain("75");
  });

  test("never lets the writer execute pull request code", () => {
    const checkout = (writer.jobs["write-analysis"].steps as Record<string, any>[])
      .find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/checkout"));
    expect(checkout.with.ref).toContain("default_branch");
    expect(checkout.with["persist-credentials"]).toBe(false);
    const serialized = JSON.stringify(writer);
    expect(serialized).not.toContain("workflow_run.head_branch");
    expect(serialized).not.toContain("pull_request_target");
    expect(writer.jobs["write-analysis"].permissions).toEqual({
      contents: "read",
      "pull-requests": "write",
      actions: "read",
    });
    // The writer must run the provenance validator, never post directly.
    expect(serialized).toContain("scripts/external-plugin-writer.ts");
  });

  test("permission-checks every maintainer command before it changes state", () => {
    const steps = router.jobs.route.steps as Record<string, any>[];
    expect(steps[0].name).toContain("write access");
    expect(JSON.stringify(steps[0])).toContain("collaborators");
    const checkout = steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/checkout"));
    expect(checkout.with.ref).toContain("default_branch");
    expect(JSON.stringify(router)).toContain("scripts/external-plugin-review.ts");
    // Transitions land as a reviewable commit, never as a silent edit.
    expect(JSON.stringify(router)).toContain("gh pr create");
  });

  test("schedules re-review from explicit record data", () => {
    expect(rereview.on.schedule).toBeDefined();
    expect(JSON.stringify(rereview)).toContain("--due");
    expect(JSON.stringify(rereview)).toContain("nextReviewAt");
    expect(rereview.jobs.due.permissions).toEqual({ contents: "read", issues: "write" });
  });
});
