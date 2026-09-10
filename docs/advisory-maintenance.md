# Advisory maintenance and upstream pilots

Two things live here: catalog advisories that inform maintainers without
blocking delivery, and the record of which upstream skills Trove adopted.

## Advisory, not gate

`catalog-advisory.yml` runs weekly. It reports two deterministic signals and
always exits successfully.

**Overlap.** Every maintained skill's description and triggers are tokenized —
stop words and boilerplate like "use this skill when" removed — and every pair
is scored by Jaccard similarity. Pairs at or above 0.35 are listed strongest
first. This is a read order, not a verdict: `trove-spec` and `trove-user-story`
score highly because they share vocabulary, not because either is redundant.

**Staleness.** Skills untouched for 365 days are listed with their last commit
date. Age alone is not decay. A stable skill can be correct and untouched, so
the report says so rather than implying a work queue.

`sync:upstream --check` runs in the same job, so vendor drift lands on the same
summary page.

Semantic duplicate detection and nuanced staleness review need judgment, which
is what agentic workflows are for. Those remain unadopted (below); the cheap
deterministic signal ships now because it costs nothing to run and needs no
model credentials.

## gh-aw is not adopted

Trove ships no GitHub Agentic Workflow. The compiler (`gh aw`) is not installed
in this repository, and a `.lock.yml` is generated output — hand-writing one
would produce exactly the untrustworthy artifact the sample repository's
`validate-agentic-workflows-pr.yml` exists to prevent.

What ships instead is the guard, ahead of the decision:
`scripts/validate-agentic-workflows.ts` runs in required validation and fails
if a `.lock.yml` has no `.md` source, or if a pull request edits a `.lock.yml`
without editing its source. Adopting gh-aw later means adding sources and
compiling them; it cannot mean committing a generated file by hand.

## Upstream pilots

Decision 5 of the plan capped the pilot at three candidates from
`github/awesome-copilot`. Two were adopted at revision
`7568a482ce2df38f8965ab5336a3220db796a4ba`.

| Candidate | Outcome | Local skill | Owner |
| --- | --- | --- | --- |
| `test-gap-audit` | Adopted | `trove-test-gap-audit` | `trove-dev` |
| `docs-sync-audit` | Adopted | `trove-docs-sync-audit` | `trove-dev` |
| `github-actions-hardening` | Declined | — | — |

`github-actions-hardening` was declined on evidence, not preference: its
upstream `SKILL.md` declares no `license:` field at the pinned revision.
`upstream.yaml` verifies license evidence from per-skill frontmatter, so
vendoring it would have meant weakening that check for one skill. It is
recorded under `not_vendored.awesome-copilot` with that reason, and can be
revisited if upstream adds the field.

### What each adoption records

Both artifacts carry the full provenance set `upstream.yaml` requires:
`base_sha`, `base_tree_digest`, `local_tree_digest`, `patch_digest`,
`checked_sha`, `imported_at`, the selection globs, the rename and preamble
transforms, and a `local.patch` holding every Trove modification.
`bun run sync:upstream -- --check` verifies the whole chain, including
reconstructing the local tree from the upstream base plus the patch.

Selection globs are `SKILL.md` and `scripts/**` only, so the repository's
generated `.lock.yml` workflows and website assets are never in scope — the
concern the plan raised before adding this source.

### Local modifications

Both skills had their frontmatter rewritten into Trove's authoring vocabulary
(`preamble-tier`, `triggers`, `benefits-from`, `metadata.source`) and the
`{{PREAMBLE}}` marker injected. Their "Related Skills" sections pointed at the
upstream author's other repositories; those now route to `trove-tdd`,
`trove-review`, `trove-doc`, and each other.

### Removal criteria

Remove an adopted skill when its upstream license changes away from MIT, when
`sync:upstream --check` reports a license or reconstruction failure that cannot
be resolved, when its eval suite falls below the rubric's `min_pass_score`, or
when a Trove skill grows to cover it. Removal is a normal pull request:
delete the skill directory, the plugin entry, the eval suite, the patch, and
the `upstream.yaml` artifact and inventory rows, then move the candidate into
`not_vendored` with the reason.
