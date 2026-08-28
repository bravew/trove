# Upstream Sync Plan for Vendored Skills

**Status:** Implemented; write automation remains gated pending two successful scheduled reports
**Reviewed:** 2026-08-28
**Companion:** [2026-08-modernization-plan.md](./2026-08-modernization-plan.md)
**Repository baseline:** `main` at `dcfade2`; `bun run validate` passes

This plan covers vendored skill provenance, deterministic drift detection, and reviewed
update pull requests.

Two decisions were taken on 2026-08-28 and are reflected throughout:

1. **The sync job is a deterministic script**, with an optional read-only summarizer that
   holds no write permission and no repository token. No model decides which upstream
   bytes land. See §3.3.
2. **The prototype prose command and scheduled workflow are superseded** and archived
   under `dev-doc/prototype/`; the `.claude/commands` symlink that made the command
   invocable has been removed. `upstream.yaml` remains on disk but is superseded by the
   v2 schema in §3.1 and must not be treated as a lock until Checkpoint 3 lands.

## 1. Verified current state

- Trove has 51 canonical skill templates.
- Three templates name `vercel-labs/agent-skills` in `metadata.source`:
  `trove-react-best-practices`, `trove-react-native`, and
  `trove-react-view-transitions`.
- The remaining 48 templates do not record an upstream. That does not prove they were
  copied, but it makes a one-time provenance review necessary.
- The repository has one squashed commit and no submodules, subtree history, `NOTICE`,
  or `THIRD_PARTY` file from which to recover provenance.
- A comment in `plugins/trove-workflow/plugin.yaml` attributes six principles to
  `spudex/pstack`, but no resolvable URL or revision is recorded.
- GitHub API checks on 2026-08-28 confirmed the current
  `vercel-labs/agent-skills` head as
  `063bee94c3f4df8453406c830b0a7df0f2860278`.

Current upstream measurements:

| Upstream skill | Last path commit | Current state |
|---|---|---|
| `react-best-practices` | `dc8367e6f91c022d83361f03c3313fa05e848ee5` (2026-04-14) | Trove has local edits and fewer referenced files; exact import base is not yet proven. |
| `react-native-skills` | `485beb804924eb4d96ea99e88a44439039c1ab5e` (2026-01-27) | Trove has local edits and fewer referenced files; exact import base is not yet proven. |
| `react-view-transitions` | `0c04547b953d49d5e91f512a7c4a6ecfcb3a7055` (2026-08-28) | Upstream `SKILL.md` is 332 lines and includes content absent locally. The local copy is not represented by this commit even though the prototype manifest uses it as `pinned_sha`. |

The upstream tree currently also contains six unvendored candidates:
`composition-patterns`, `deploy-to-vercel`, `vercel-cli-with-tokens`,
`vercel-optimize`, `web-design-guidelines`, and `writing-guidelines`. Their existence is
informational; this plan does not authorize importing them.

Each of the three upstream `SKILL.md` files declares `license: MIT` in frontmatter. The
upstream repository has no top-level license file. Preserve the per-skill license notice
and record its source, but treat any interpretation of redistribution obligations as a
maintainer/legal decision rather than something the sync script infers.

The curated Sentry and Figma revisions in `upstream.yaml` also resolved successfully on
2026-08-28. Resolution proves that the commits exist; it does not prove that they are
current or that the curated metadata still matches their repositories.

## 2. Blocking problems in the prototype

### 2.1 `pinned_sha` does not consistently mean “what is vendored”

The command says a pin records the upstream content represented by the local copy. The
manifest pins `react-view-transitions` to the current upstream path commit while also
marking the local copy stale and materially different. Those states cannot both be true.

Use separate fields:

- `base_sha`: the exact upstream revision from which the local copy/patch set was
  derived;
- `base_tree_digest`: a deterministic digest of the selected upstream files after path
  filtering but before local patches;
- `checked_sha` and `checked_at`: the latest upstream revision a maintainer
  accepted as inspected. A report-only `--check` never writes these — it writes
  nothing at all; only an update operation records them;
- `candidate_sha`: optional revision proposed by an open update;
- `imported_at`: when `base_sha` actually became the vendored base.

Never advance `base_sha` or `base_tree_digest` for a report-only run or a conflicted
update.

### 2.2 The proposed classification is not a real three-way comparison

“Upstream-only change” cannot be established from only the current local tree and new
upstream tree. The updater needs:

1. old upstream at `base_sha`;
2. current local source, including declared local changes;
3. proposed upstream at `candidate_sha`.

The existing free-form `divergence:` prose is valuable review context but cannot locate
changed files or regions reliably. Store deterministic transformations and local patch
files, then perform a three-way merge/rebase. Any patch failure or overlapping change is
a conflict and must remain unapplied.

### 2.3 An unattended LLM must not be the merge engine

Upstream skill bodies are untrusted text. Giving an agent repository write access,
secrets, broad `Bash(git *)`, and `Write`/`Edit` tools while asking it to interpret that
text creates an avoidable prompt-injection and supply-chain path. A prose command also
cannot guarantee stable hashing, path normalization, or identical results on rerun.

The scheduled job must call a deterministic, reviewed script. An agent may summarize a
machine-generated report in a separate read-only job, but it must not decide which
upstream bytes to apply or receive write credentials while reading untrusted content.

### 2.4 The workflow overstates its readiness

The prototype workflow:

- uses `bun install` instead of the repository lockfile-enforcing `bun ci`;
- pins checkout and setup-bun to SHAs but references
  `anthropics/claude-code-action@v1` by a movable tag;
- grants `id-token: write` alongside a static OAuth input;
- has no deterministic sync implementation or tests behind the prose command;
- permits broad Git and file-write operations;
- claims the mechanism is "built, working" although `scripts/validate.ts` does not parse
  `upstream.yaml` and no end-to-end sync test exists.

**Disposition (2026-08-28).** The prototype prose command and workflow are superseded and
have been moved to `dev-doc/prototype/` with `SUPERSEDED-` prefixes, and the
`.claude/commands` symlink that made the command invocable has been removed. They are
kept as a record of the rejected design, not as a starting point. `upstream.yaml` stays
in place but is superseded by the v2 schema in §3.1 and must not be treated as a lock.

**On `id-token: write`.** The bullet above is a narrower criticism than it first appears.
Claude Code's GitHub Actions documentation lists `id-token: write` as *required for the
action's default GitHub App authentication*, not only for workload identity federation,
so granting it is correct **whenever that action is used**. Under the §3 design the
action is not used for merging, so the permission is simply unnecessary there. Do not
generalize this into "never grant `id-token: write`."

## 3. Target design

### 3.1 Provenance manifest

`upstream.yaml` should be machine-validated and describe source identity, selection,
transformation, and lock state. Suggested shape:

```yaml
version: 2
sources:
  - id: vercel-agent-skills
    repository: https://github.com/vercel-labs/agent-skills.git
    ref: main
    license:
      expression: MIT
      evidence: per-skill-frontmatter
    artifacts:
      - id: trove-react-view-transitions
        upstream_path: skills/react-view-transitions
        local_path: skills/coding/trove-react-view-transitions
        base_sha: <proven imported revision>
        base_tree_digest: sha256:<digest>
        checked_sha: <last inspected revision>
        checked_at: <ISO-8601 timestamp>
        include: [SKILL.md, references/**]
        path_map:
          rules/: references/
        transforms:
          - kind: rename-skill
            from: vercel-react-view-transitions
            to: trove-react-view-transitions
          - kind: inject-preamble
            marker: "{{PREAMBLE}}"
        patches:
          - upstream-patches/trove-react-view-transitions/local.patch
```

Requirements:

- schema rejects unknown/missing keys and paths outside the repository;
- SHAs are full 40-character commit IDs;
- digests cover path names, modes where relevant, and file bytes in sorted order;
- include/exclude rules are explicit; symlinks and path traversal are rejected;
- transformations are named, ordered, deterministic, and unit-tested;
- local edits live in reviewable patch files or structured transformations, not only in
  prose;
- every canonical skill receives `origin: original`, `origin: adapted`, or a resolvable
  upstream record after the provenance audit.

### 3.2 Deterministic sync command

Implement a Bun script, for example `scripts/sync-upstream.ts`, with these modes:

```text
--check                 fetch and report only; never write
--update <artifact>     create a local candidate for one artifact
--update-source <id>    create candidates serially for one source
--offline               verify checked-in lock data without network
--json <path>           write a machine-readable report
```

For each artifact:

1. validate the manifest and require a clean worktree for update mode;
2. fetch the repository/ref and resolve a full candidate SHA;
3. materialize old upstream at `base_sha` and candidate upstream at the new SHA into
   separate temporary directories;
4. verify selection, file limits, symlinks, license evidence, and both tree digests;
5. derive/replay the checked-in local patch set on the candidate upstream tree;
6. stop on any failed patch, overlapping edit, license change, unexpected file type,
   oversized file, or generated/binary content not explicitly allowed;
7. write only the canonical template/references for a clean candidate;
8. run build, tests, and validation;
9. update `base_sha`, digest, and import date only after the candidate is accepted into
   the working tree and verification passes;
10. emit a stable JSON/Markdown report containing old/new SHAs, changed paths, license
    evidence, patch status, and verification results.

The same inputs must produce byte-identical output. Running an accepted update again
must return no changes.

### 3.3 Pull-request workflow

**Decision (2026-08-28): the sync job is a deterministic script. A model never decides
which upstream bytes land.** An optional summarizer may render the script's
machine-readable report into PR prose, and it runs **read-only, in a separate job, with
no write permissions and no repository token**. This resolves §2.3 structurally rather
than by policy: the component that reads untrusted upstream text has no ability to write.

Use GitHub Actions only after the deterministic script exists.

**Job 1 — check (weekly, default).**

- `permissions: contents: read`. No model secret. No write scope of any kind.
- `bun ci`, then baseline build/test/validate before checking upstream.
- Runs `scripts/sync-upstream.ts --check --json`; uploads the report as an artifact.
- Exits non-zero only on infrastructure failure. "Update available" is a report, not a
  failure.

**Job 2 — update (manual `workflow_dispatch` first; scheduled only after a track record).**

- `permissions: contents: write, pull-requests: write`. **No `id-token: write`** — see
  §2.4; nothing in this design performs an OIDC exchange.
- Runs the deterministic updater for **one artifact per branch/PR**. Never auto-merge.
- Pin every third-party action to a reviewed full commit SHA. With the agent action gone
  from the merge path, the remaining actions are `actions/checkout` and `setup-bun`,
  both already SHA-pinned in `validate.yml`.
- Authenticate with a GitHub App or a fine-scoped automation token. Do not rely on an
  interactive subscription token as the durable design.
- Set `timeout-minutes`, concurrency, and explicit file/byte ceilings. A turn limit is
  not a cost or safety boundary.

**Job 3 — summarize (optional, read-only).**

- Consumes only the JSON report artifact from job 1 or 2. It must not clone upstream, and
  must not receive `contents: write`, `pull-requests: write`, or a repo token.
- Its output is commentary. The PR body's factual sections come from the script.
- If this job is skipped or fails, the PR is still complete and correct.

Treat "no changes," "conflict," "license changed," and "validation failed" as distinct
machine-readable conclusions in the report schema.

GitHub schedule caveats remain relevant: schedules run from the default branch, may be
delayed during high load, and public-repository schedules can be disabled after 60 days
of inactivity. These are operational notes, not substitutes for monitoring failures.

## 4. Throughput checkpoint

- **Blocking first steps:** provenance classification and reconstruction of a truthful
  base for the three known vendored skills. No automated merge is sound without them.
- **Independent workstreams:** provenance review of disjoint skill groups, manifest
  schema/tool implementation, and report-only workflow hardening can proceed in
  parallel after the schema is agreed.
- **Shared mutable state:** `upstream.yaml`, patch files, and the three vendored skill
  directories are shared; serialize updates to each artifact and never let two jobs
  update the lock concurrently.
- **Smallest safe decomposition:** six independently verifiable checkpoints.

## 5. Implementation checkpoints

### Checkpoint 1: Provenance inventory and policy

**Likely files:** `upstream.yaml`, new `NOTICE`/`THIRD_PARTY` artifact, skill metadata,
and an audit worksheet under `dev-doc/` or `docs/`.

**Observable result:** all 51 skills have a recorded origin classification; the
`spudex/pstack` statement is resolved to a source/revision or removed; known third-party
licenses and attribution are preserved.

**Verify:** manifest inventory equals the canonical template inventory; every adapted or
vendored entry has a resolvable source and evidence. A maintainer reviews the license
record before automation proceeds.

### Checkpoint 2: Reconstruct bases and local patches

**Likely files:** `upstream.yaml`, `upstream-patches/**`, the three vendored templates
and references.

**Observable result:** each known vendored skill can be reproduced byte-for-byte from
its proven `base_sha` plus deterministic transformations and patches. The stale
`react-view-transitions` pin is corrected to a truthful base or explicitly left
`base_sha: null`/blocked until provenance is proven.

**Verify:** a reconstruction command in a temporary directory produces no diff against
the canonical source; tree digests match; repeated runs are identical.

### Checkpoint 3: Manifest schema and read-only checker

**Likely files:** `scripts/schema.ts` or a dedicated schema module,
`scripts/sync-upstream.ts`, `scripts/validate.ts`, unit fixtures.

**Observable result:** `--check --offline` validates all local locks; online check
reports candidate SHAs without modifying tracked files; malformed paths, short SHAs,
unknown fields, and digest mismatches fail closed.

**Verify:** unit tests with malicious paths/symlinks and fixture repositories, then
`bun run validate`. Assert `git status --short` is unchanged after check mode.

### Checkpoint 4: Deterministic one-artifact updater

**Likely files:** sync implementation, three-way/patch fixtures, report renderer,
vendored skill tests.

**Observable result:** one artifact updates cleanly when upstream-only changes do not
conflict, reports conflicts without touching the source, preserves license metadata,
and is idempotent.

**Verify:** local fixture repository tests for add/edit/delete/rename/conflict/license
change/binary/oversize cases; two consecutive update runs leave the second diff empty;
full `bun test`, build, and validate pass.

### Checkpoint 5: Manual first sync

**Likely files:** one vendored skill, its patch/lock entry, generated artifacts, PR
report.

**Observable result:** a maintainer-reviewed PR updates exactly one skill, contains no
unrelated edits, and shows old/new base SHAs, file changes, patch status, license check,
and verification output.

**Verify:** independently compare the PR candidate with upstream and the patch set;
run full tests and host artifact checks. Merge manually or reject. Never auto-merge.

### Checkpoint 6: Scheduled report, then PR automation

**Likely files:** `.github/workflows/upstream-sync.yml` (written fresh; the prototype in
`dev-doc/prototype/` is not a starting point), action pin policy/Dependabot, monitoring
documentation.

**Observable result:** the report-only job runs twice successfully before any write
permission is enabled; update mode creates at most one PR per artifact, handles an
existing PR idempotently, and produces no branch on a no-op. The optional summarizer, if
enabled, runs in its own job with no write scope and no repository token.

**Verify:** `workflow_dispatch` tests for no-op, clean update, conflict, validation
failure, and rerun; inspect effective permissions per job and confirm every action uses a
full SHA. Assert the summarizer job cannot write by removing its token and confirming the
PR is still produced correctly. Watch the first two scheduled runs before relying on
alerts.

## 6. Rollout and ownership

1. The prototype workflow is archived, not merged. Write the replacement fresh against
   §3.3 once the deterministic script exists.
2. Complete Checkpoints 1–3 before any upstream content is modified automatically.
3. Sync before performing the modernization plan's editorial refresh of the same skill.
4. Assign a named maintainer/code owner for provenance manifest and patch changes.
5. Revisit registry consumption only after comparing update control, transformation
   needs, availability guarantees, and license metadata. `npx skills add` is a delivery
   option, not an automatic substitute for provenance or review.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Upstream content contains instructions designed to influence an agent. | Deterministic updater decides every byte. The optional summarizer reads only the script's JSON report, runs in its own job, and holds no write permission or repository token, so no write-capable component ever reads upstream prose. |
| The original import base cannot be proven from the squashed history. | Mark the artifact blocked; perform a maintainer-reviewed re-baseline against a chosen upstream revision and record that decision explicitly. |
| Patch files drift from local edits. | Reconstruction and digest checks run in `bun run validate`; changes to vendored paths require matching patch/lock updates. |
| Upstream deletes or renames files. | Report deletions/renames by default; require an explicit manifest decision to remove local content. |
| License evidence disappears or changes. | Fail closed, keep the old base, and require maintainer/legal review. |
| A scheduled workflow or dependency is compromised. | Full-SHA action pins, minimal permissions, no unnecessary secrets, deterministic scripts, and mandatory PR review. |
| Multiple runs race on one lock. | Concurrency plus one artifact per update branch and idempotent existing-PR detection. |

## 8. Primary sources reviewed on 2026-08-28

- [Google Open Source Vendor Source](https://opensource.google/documentation/reference/thirdparty/vendorsrc).
  Keep pristine vendor material separate from local modifications.
- [Google Go third-party import process](https://opensource.google/documentation/reference/thirdparty/go)
  describes deriving local patches from the old import, replaying them on the new import,
  and verifying manifests and checksums.
- [OpenTitan vendor tool](https://opentitan.org/book/util/doc/vendor.html) and
  [vendoring guidance](https://opentitan.org/book/doc/contributing/hw/vendor.html).
  These document exact revision locks, explicit update mode, and patch refresh.
- [GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
  covers least privilege, secret handling, and immutable full-SHA action pins.
- [GitHub Actions schedule events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
  covers default-branch, delay, actor, and inactivity behavior.
- [Bun CI installs](https://bun.sh/docs/pm/cli/install). `bun ci` enforces the committed
  lockfile.
- [Claude Code action security](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)
  covers bot controls, credential handling, and output exposure. Retained for reference
  only: per the 2026-08-28 decision the action is not used for merging, so its bot-actor
  and `allowed_bots` behavior no longer applies to this design.
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions) documents
  `id-token: write` as required for the action's default GitHub App authentication. Basis
  for the clarification in §2.4.

All URLs above returned HTTP 200 when re-checked on 2026-08-28.
- GitHub API checks for `vercel-labs/agent-skills`, `getsentry/sentry-for-ai`, and
  `figma/mcp-server-guide`, performed 2026-08-28.

## Decision gate

Checkpoints 1–4 are implemented and verified. The live Checkpoint 5 run was a clean
no-op because upstream head already matched the accepted bases; fixture repositories
cover clean and conflicted updates. Checkpoint 6 is installed with write mode gated by
`UPSTREAM_SYNC_WRITES_ENABLED`. Do not enable that variable until two scheduled
report-only runs complete successfully and their artifacts are inspected.
