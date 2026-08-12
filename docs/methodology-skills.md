# Methodology Skills

`trove-workflow` owns the process skills that coordinate planning, debugging,
review, verification, refactoring, design rationale, and git workflow, plus a
set of cross-cutting design-discipline principles. The session anchor
`using-trove` routes to these skills through the generated `routing.md`
fragment next to the plugin manifest, with `docs/routing.md` as the
repository-wide fallback, and asks the agent to name any principle that shaped
a decision and run produced prose through `trove-unslop`.

Each skill below is described with: the rule it enforces, when it should
fire, common bypass attempts and how the skill resists them, and a short
example transcript shape.

## trove-brainstorm

**Rule.** Do not write code until the design is approved.

**When to use.** A user asks for new product behavior, a UI surface, a
feature, or a broad refactor and there is no existing spec or accepted plan
in the transcript.

**Common bypass attempts.**

- "Skip the brainstorm, just write the code." The skill states the rule once
  and asks whether the current shape is approved before any edit.
- "It's a small change." Genuinely narrow asks like "fix this typo" or
  "write this regex" stay out of scope; the skill is keyed on product
  shape, not line count.

**Example transcript shape.**

```
User: let's build a referrals page.
Assistant: Skill: trove-brainstorm
  Goal: …
  Five-bullet design: outcome, scope, data, UI/workflow, verification.
  Approve, revise, or stop?
```

## trove-plan

**Rule.** A plan is a sequence of verifiable checkpoints, not a wish list.

**When to use.** After brainstorm approval or for any multi-step work that
needs sequencing; cap at seven checkpoints, each independently verifiable.

**Common bypass attempts.**

- "Just give me the steps." The skill insists each step name an observable
  result and a verification command or inspection.
- "I know how it ends, skip the plan." The skill keeps the plan short
  rather than skipping it; the gate is verifiability, not length.

**Example transcript shape.**

```
Assistant: Skill: trove-plan
  1. Wire the route — verify with `bun run dev` and a manual nav.
  2. …
  Stop after seven checkpoints; surface unknowns as risks.
```

## trove-execute-plan

**Rule.** Run one checkpoint at a time; verify before moving on.

**When to use.** A `trove-plan` artifact exists and the user signals to
implement, "go", or "continue".

**Common bypass attempts.**

- "Do them all at once." The skill refuses to skip checkpoints and only
  advances after the stated verification passes or the user accepts the
  risk.
- "Tests are probably fine." A verification result must be stated or named
  as a gap.

**Example transcript shape.**

```
Assistant: Skill: trove-execute-plan
  Checkpoint 1 done; `bun test` 132/0. Move to checkpoint 2?
```

## trove-verify

**Rule.** Before claiming done: run the tests, reread the diff, list the
unverified assumptions.

**When to use.** Before any "done", "fixed", "complete", "ready", or
"shipped" claim leaves the assistant.

**Common bypass attempts.**

- "Fixed all review comments." The skill insists on per-comment status and
  a stated verification command, not a batch claim.
- "Should work." The skill names the unverified assumption explicitly so
  the user can decide whether to ship or extend the check.

**Example transcript shape.**

```
Assistant: Skill: trove-verify
  Ran: `bun run validate`, `bun test` (132/0).
  Reread diff: only intended files touched.
  Unverified: live Claude transcript (manual step).
```

## trove-debug

**Rule.** Reproduce, narrow, hypothesize, verify — in that order.

**When to use.** Bug report, failing test, broken behavior, red CI,
regression, or unexplained production symptom.

**Common bypass attempts.**

- "Just patch it." The skill insists on a reproduction step before the fix
  so the patch can be verified.
- "I can guess the cause." The skill stages exactly one hypothesis at a
  time and re-runs the reproduction after the fix.

**Example transcript shape.**

```
Assistant: Skill: trove-debug
  Repro: `bun test tests/p3-delegation.test.ts -t "fans out"` fails.
  Narrowed to scripts/lib/projection.ts:42.
  Hypothesis: missing dispatch map for empty platforms[].
```

## trove-dispatch

**Rule.** Independent work fans out; dependent work runs sequentially.

**When to use.** A user prompt contains 2+ tasks with no stated dependency,
or large bounded sidecar work suits parallel agents.

**Common bypass attempts.**

- "Run them all in parallel." The skill builds a dependency map first and
  only opens parallel agents on disjoint files with a clear output.
- "One agent can do it all." Where the work is truly independent, the
  skill prefers fan-out so each agent owns a bounded scope.

**Example transcript shape.**

```
Assistant: Skill: trove-dispatch
  Task A (audit B1) — independent of B2/B3 → parallel agent.
  Task B (audit B2) — independent of B1/B3 → parallel agent.
  Task C (run validate) — independent of A and B → parallel.
```

## trove-receive-review

**Rule.** Address every comment explicitly, even when declining.

**When to use.** The user pastes review feedback, links a PR review, or
asks the assistant to handle requested changes.

**Common bypass attempts.**

- "Fixed all comments." The skill requires a numbered per-comment
  disposition: accept, clarify, or decline with reason.
- "Skip the obvious ones." Even trivial comments get an ack so nothing
  drops silently.

**Example transcript shape.**

```
Assistant: Skill: trove-receive-review
  1. Rename helper → accept (commit a1b2c3d).
  2. Switch to async — decline; sync is hot-path on Lambda init.
  3. Add a test → accept (commit d4e5f6a).
```

## trove-worktree

**Rule.** Spike or risky work goes in a worktree, never on the user's
branch.

**When to use.** "Spike", "try", "experiment", or refactor that crosses
unrelated subsystems and would dirty the user's branch.

**Common bypass attempts.**

- "Just edit in place." The skill creates the worktree first when the user
  approves or when the request already asked for a spike.
- "We'll clean up later." The skill names what to keep and what to
  discard at the end of the spike, not after the fact.

**Example transcript shape.**

```
Assistant: Skill: trove-worktree
  Branch: spike/oauth-pkce in ../wt-oauth-pkce.
  Created. Edits land there until the spike succeeds or is abandoned.
```

## trove-write-skill

**Rule.** Author the rubric and tasks before the SKILL body. Skills are
tested code.

**When to use.** Adding a new Trove skill, improving an existing one,
or generating a `rubric.yaml`.

**Common bypass attempts.**

- "Just write the body." The skill refuses skill PRs that lack
  `rubric.yaml` and at least three task prompts (one bypass/edge case).
- "Tests later." The decision gate flags rubric-and-tasks-first as the
  default; revisions after the fact require an explicit override.

**Example transcript shape.**

```
Assistant: Skill: trove-write-skill
  Drafted rubric.yaml (4 weighted dimensions).
  3 tasks: happy-path, bypass attempt, edge case.
  Now writing SKILL.md body — body cap is the rule, gate, mechanism.
```

## trove-autoplan (orchestrator)

**Rule.** Orchestrate spec → user stories → release-note preview through
the leaf product skills; defer detail to those skills.

**When to use.** "Autoplan", "turn this idea into a plan", or any request
that needs a coordinated spec/stories/preview pass.

**Common bypass attempts.**

- "Skip the spec." The orchestrator stops at decision gates between
  stages; skipping requires an explicit user override.
- "Inline the detail." Each stage delegates to its leaf skill rather than
  re-implementing the detail in the orchestrator body.

## trove-ship (orchestrator)

**Rule.** Orchestrate review → commit → ship-readiness; surface a final
decision gate before any destructive action (push, PR, tag).

**When to use.** "Ship this change", "prepare to land", "get this
PR-ready".

**Common bypass attempts.**

- "Push it now." The orchestrator surfaces the final decision gate even
  when the diff is small and the change looks ready.
- "Skip the review." Review is a leaf-skill stage; the orchestrator runs
  it before commit, not after.

## trove-refactor

**Rule.** A refactor preserves behavior; pin it first, migrate callers and
delete the legacy API in one wave, prove it unchanged on the real artifact.

**When to use.** Rename, extract, inline, dedupe, move, or an internal-API
migration (directly relevant to the Vue→React and Lambda→jobs migrations).

**Common bypass attempts.**

- "The type-check passes, so behavior is preserved." A compile is not a
  behavior pin; the skill requires a characterization test or snapshot.
- "Leave the old API as a shim." The skill migrates callers and deletes the
  legacy API in the same wave (see `trove-principle-migrate-then-delete`).

## trove-why

**Rule.** Reconstruct intent from cited historical evidence; never infer it
from the code's current shape.

**When to use.** "Why does X work this way", "why did we pick Y",
regressions, postmortems.

**Common bypass attempts.**

- "Just read the code and tell me why." The skill queries git plus the
  declared MCPs (Linear, Notion, Slack, Sentry) by fully-qualified
  `Server:tool` name and cites primary evidence.
- "Give me the reason." When evidence is absent it reports a null result
  rather than fabricating a confident rationale.

## trove-unslop

**Rule.** Cut AI tells from prose without dropping content; write it clean
the first time.

**When to use.** Before finalizing a PR description, release note, spec, or
reply; a `benefits-from` of `trove-commit`, `trove-ship`, `trove-release-notes`,
`trove-spec`, and `trove-user-story`.

## trove-reflect

**Rule.** Mine the session for durable learnings and route each into a
concrete edit — never auto-applied.

**When to use.** The user says "reflect", or a session surfaced a recurring
correction or a non-obvious project quirk.

**Common bypass attempts.**

- "Just update the skill." The skill presents proposed edits and waits for
  approval; skill changes affect every future agent.
- "Add a reminder." A learning better encoded as a lint/rubric routes to
  structure (`trove-principle-encode-in-structure`), not more prose.

## trove-show-work

**Rule.** Keep one append-only TSV decision log (what, why, evidence,
result) for long or unattended runs.

**When to use.** Autonomous or multi-phase runs, or work a human reviews
after stepping away. Ships `scripts/log.sh` (UTC stamps, formula-injection
guard).

## trove-arena

**Rule.** Spawn N parallel candidates in isolated worktrees, pick a base,
graft the best losing ideas in, then verify. Heavyweight — most work routes
to `trove-architect` instead.

**When to use.** A genuinely novel, hard-to-reverse design decision with no
precedent. The skill declines mechanical or single-approach work.

## Design-discipline principles

Six short, cross-cutting principle skills live under `skills/principles/` and
ship in `trove-workflow`. They carry no auto-attach globs; they surface by
description and by `benefits-from` on the skills they support, and
`using-trove` asks the agent to name the principle and the concrete choice
it changed. The remaining pstack principles are folded into the skills they
map to (e.g. prove-it-works → `trove-verify`, fix-root-causes → `trove-debug`,
minimize-reader-load → `trove-review`).

| Skill | Rule |
|---|---|
| `trove-principle-laziness` | Most result, least code; bias to deletion and the smallest change. |
| `trove-principle-data-shape` | Get the data shape right before logic; a late change is a rewrite. |
| `trove-principle-type-discipline` | Make illegal states unrepresentable; parse at boundaries; don't lie to the compiler. |
| `trove-principle-migrate-then-delete` | Migrate callers and delete the legacy internal API in one wave. |
| `trove-principle-idempotency` | Operations converge to the same end state under retries and crashes. |
| `trove-principle-encode-in-structure` | Encode a recurring lesson as a lint/rubric/check, not another instruction. |

## Migration History

`trove-autoplan` and `trove-ship` moved from `trove-dev` to `trove-workflow`.
`trove-dev` keeps deprecated stub aliases for one release; the source of
truth lives in `skills/workflow/`.
