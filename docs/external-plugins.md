# External plugin governance

Trove's catalog is first-party. This document describes the machinery that
would admit a third-party plugin, and the conditions it must meet. The
registry at `external/plugins/` is empty on purpose: nothing external ships
until a record lands there through a reviewed pull request and an explicit
maintainer approval.

## Policy

`external/policy.yaml` is the single source of every threshold. No limit is
duplicated in workflow YAML, so changing policy is one reviewed diff.

| Gate | Rule |
| --- | --- |
| Source host | `github.com` only |
| Revision | Exact 40-character commit SHA; a branch or tag is rejected |
| Licenses | Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MIT, MPL-2.0 |
| Components | `skills`, `agents`, `commands` allowed; `hooks`, `mcpServers`, `lspServers`, `extensions` prohibited |
| Review cadence | 183 days, stored as explicit record data |
| Sandbox | 32 MiB clone, 4000 files, 1 MiB per file, 120s clone, 300s install |

Hooks and MCP servers are prohibited in the first policy because both execute
code or open network egress on a contributor's machine as soon as the plugin
is installed.

## Record shape

One `external/plugins/<name>.yaml` per plugin, `trove.external-plugin.v1`.
`tests/fixtures/external-plugins/valid.yaml` is the reference shape.

Review state is explicit data — `disposition`, `reviewer`, `revision`,
`reviewedAt`, `nextReviewAt` — not something inferred from a GitHub timestamp.
The sample repository this design draws on treats 183 days since issue closure
as the review interval, which hides domain state inside issue mechanics and
breaks the moment an issue is reopened.

`review.revision` records the revision a human actually reviewed. If
`source.sha` later moves, the record fails with `review-revision-drift` rather
than silently distributing unreviewed code.

## Lifecycle

```text
issue submission ──> external-plugin-intake.yml ──> normalized record
                                                          │
                                           pull request adding the record
                                                          │
                              external-plugin-pr-quality-gates.yml (unprivileged)
                                                          │
                                            bounded JSON artifact
                                                          │
                        external-plugin-pr-quality-gates-writer.yml (privileged)
                                                          │
                                 /external approve <record>  (write access only)
                                                          │
                                               approved, next review in 183 days
                                                          │
                                external-plugin-rereview.yml ──> /external keep | needs-changes | remove
```

Dispositions and the transitions allowed between them live in
`scripts/lib/external-plugin.ts`, not in workflow expressions:

| Command | Allowed from | Result |
| --- | --- | --- |
| `approve` | `proposed`, `needs-changes` | `approved`, stamping reviewer, revision, and next review date |
| `needs-changes` | `proposed`, `approved` | `needs-changes`, clearing the review window |
| `reject` | `proposed`, `needs-changes` | `rejected` |
| `keep` | `approved` | `approved`, refreshing the same window rather than stacking a new one |
| `remove` | `approved`, `needs-changes`, `rejected` | `removed` |

Running `keep` twice at the same instant produces a byte-identical record. Every
transition is applied on the default branch and opened as a pull request, so
approvals, overrides, re-reviews, and removals are commits a reader can audit.

## Isolation

The gate treats every clone as hostile.

- The analyzer holds no secrets and no write permission, and checks out with
  `persist-credentials: false`. A test asserts the workflow contains no
  `secrets.` reference at all.
- The clone runs with a scrubbed environment: no ambient token,
  `GIT_TERMINAL_PROMPT=0`, a sandbox `HOME` and `TMPDIR`, and a wall-clock
  timeout from policy.
- Only the exact pinned SHA is fetched, at depth 1, and the resulting `HEAD` is
  compared against the record.
- The tree is measured before anything else runs: total bytes, file count,
  per-file bytes, and symlinks that point outside the clone.
- The subdirectory is resolved and confirmed to stay inside the clone before a
  Copilot install touches it.
- The Copilot install runs against a throwaway `HOME` in the sandbox.

## Submitter fixes versus our failures

Every finding carries an audience: `submitter`, `maintainer`, or
`infrastructure`. The gate exits `1` for the first two and `75` (`EX_TEMPFAIL`)
for the third, and the workflow turns `75` into a warning rather than a red
check. A network blip on our runner is never reported to a contributor as
"your plugin is broken".

## The privileged writer

The writer runs from `workflow_run`, checks out the trusted default branch, and
never checks out or executes pull-request content. The analyzer artifact is
untrusted input, so `scripts/lib/writer-provenance.ts` re-derives the pull
request from the API and refuses to write on any of: an artifact over 256 KiB,
an unexpected producing workflow or event, a schema it does not recognize, an
invalid pull request number, a head SHA the pull request has moved past, a
changed head repository or ref, a moved base, a fork mismatch, or a pull
request that is no longer open. Comments are marker-delimited, so repeated runs
update one comment instead of stacking.

## Before enabling public intake

The machinery is complete and tested; turning on a public front door is still a
policy decision. Before advertising intake, confirm the runner has no
organization secrets available to fork pull requests, decide who holds the
maintainer role for approvals, and agree what happens to installed users when a
plugin is removed.
