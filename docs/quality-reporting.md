# Quality reporting

Trove produces a versioned JSON report first and renders Markdown from that
artifact. Pull requests analyze the merge-base changed scope in
`skill-check.yml`; `skill-quality-report.yml` runs the full catalog weekly and
compares it with the last successful report when the schema, rule fingerprint,
and skill scope match.

```sh
bun run quality:report:changed -- --base=origin/main --head=HEAD
bun run quality:report -- --with-install
bun run quality:render -- --render=quality-report.v1.json --markdown=quality-report.md
```

The schema is `schemas/quality-report.v1.schema.json`. Reports record the full
commit SHA, scope, tool versions, rule fingerprint, raw findings, hard blockers,
dimension numerators and denominators, coverage, and comparable trend deltas.
Pull request and scheduled artifacts are retained for 90 days.

## Blocking rules

Trove validation errors, stale generated files, missing required eval suites,
new Vally failures, and Copilot install failures are hard blockers. Warnings
remain in the report and do not fail the job. Model scoring is separate from
the deterministic structural gate and is marked unavailable when it did not
run.

Vally is pinned to `@microsoft/vally-cli@0.15.0` on Node 22.12.0. The initial
catalog baseline is stored in `quality/vally-baseline.v1.json`. Its 11 exact
findings remain visible as accepted warnings; a different message, rule, or
skill is a new blocking failure. The baseline covers six canonical
`allowed-tools` arrays and five repository-level documentation references that
Vally requires to stay inside the skill directory. Removing a finding also
requires removing its baseline entry so it cannot mask a future regression.

## Scorecard

The v1 weights are structure and specification 20, host projection and install
20, independent lint 15, behavioral evidence 25, documentation/routing/
ownership 10, and provenance/supply chain 10. Each dimension records its raw
numerator and denominator. Accepted Vally findings reduce the independent-lint
numerator even though they do not block.

The overall 0–100 score is published only when every dimension has comparable
evidence. Missing model-backed behavioral evidence is `unavailable`, lowers
coverage, and suppresses the overall score instead of becoming a pass or zero.
Hard blockers remain independent from every weighted result.

The workflows publish job summaries and read-only artifacts. They do not post
pull request comments, so no privileged `workflow_run` writer is enabled.

Because there is no writer, the analyzer/writer split for `upstream-sync.yml`
is deferred rather than built on a pattern that does not exist yet. The
credential exposure it targeted is narrowed instead: `UPSTREAM_SYNC_TOKEN` is
no longer a job-level variable, so the step that clones untrusted upstream
repositories runs without it and only the pull-request step receives it. A test
in `tests/upstream-sync.test.ts` holds that property.
