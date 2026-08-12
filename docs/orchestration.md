# Orchestration & Delegation

How to compose skills and delegate bounded exploration to sub-agents.

## The default delegation pattern

The main agent keeps the **critical path**. Delegated agents go off and explore
**bounded side areas**, then return concise findings. The parent integrates and
decides.

1. **Parent stays on the critical path.** It owns the user's primary intent and
   makes the final decisions.
2. **Delegate bounded exploration.** Map a flow, inspect tests around a target
   area, verify a suspected regression, gather file-level context for a
   subsystem.
3. **Sub-agent returns a concise finding.** Not a transcript; a useful summary.
4. **Parent integrates.** Reads the finding, makes a call, moves on.

## Good delegated tasks

- *"Map the auth flow from login to session creation; report each callsite."*
- *"Run the existing test suite for `services/billing`; report any failures."*
- *"Search the repo for callers of `legacyParse()` and group them by package."*
- *"Verify whether commit `abc123` is the regression that introduced `<bug>`."*
- *"Inspect the migration history in `db/migrate` and summarize the last six months."*

What makes them good: scoped surface, concrete deliverable, no parent block.

## Bad delegated tasks

- *"Do the whole feature."* — there is no parent waiting for an integration step.
- *"Own the entire refactor."* — same problem; delegation isn't ownership transfer.
- *"Figure out what the user wants."* — the parent has the user context.
- Any task where the parent is **immediately blocked** on the result. If the
  parent can't do anything else until the sub-agent returns, you've added
  context-switch overhead with no parallelism win — just do it inline.

## How to bound scope

Every delegation should declare:

- **Inputs:** what the sub-agent gets (paths, identifiers, prior findings).
- **Output:** what shape the parent expects back (one paragraph, a JSON list,
  a yes/no with one supporting cite).
- **Time/depth budget:** how far it should drill before returning. Without a
  budget, sub-agents over-explore and the parent waits.
- **Permission scope:** if the host supports it, restrict the sub-agent's
  tools. Read-only investigation rarely needs `Write` or `Edit`.

## Phrasing explicit handoffs

Write the delegation as if you were assigning a task to a colleague who can't
ask follow-up questions:

> *"Investigate the `useSessionState` hook. Specifically: (1) when does it
> trigger a re-render, and (2) is there a path where the cleanup function
> never runs? Read-only. Return at most three callsites with line numbers
> plus a one-paragraph summary. If you can't decide in 5 minutes of looking,
> say so and stop."*

Not:

> *"Look at the session stuff and figure out what's wrong."*

## Composition via meta-skills

Some workflows compose multiple skills end-to-end. Examples in this repo:

- **`trove-autoplan`** — takes an idea → frames it as a spec (`trove-spec`) →
  drafts user stories (`trove-user-story`) → previews the release-note shape
  (`trove-release-notes`).
- **`trove-ship`** — review the diff (`trove-review`) → write the commit
  (`trove-commit`) → produce a PR-ready summary.

Meta-skills should:

- Reference existing skills by name and **defer the detail to them.**
- Define the sequence and decision points (Decision Gates).
- Stay short. A meta-skill is an orchestration plan, not a kitchen sink.

If a meta-skill grows past ~150 lines or starts duplicating leaf-skill content,
that's a signal to split it back out.

## `benefits-from` metadata

Skills declare advisory relationships in frontmatter:

```yaml
benefits-from:
  - trove-security-review
  - trove-secret-scan
```

This is **advisory**, not an execution engine. The build emits
`docs/routing.md` with reverse `benefits-of` lookups, the CLI surfaces them in
`trove info`, and tooling can suggest related skills — but nothing
auto-runs the dependencies. Cycles and references to unknown skills surface as
warnings during `bun run validate`.

Use it for **clear pairings**, not speculation:

- `trove-review` benefits from `trove-security-review` and `trove-secret-scan`
  because a thorough code review touches both surfaces.
- `trove-spec` benefits from `trove-user-story` because a complete spec usually
  spawns one or more stories.

Skip it when the relationship isn't obvious to the next reader.

## Host-specific delegation surfaces

Different hosts expose delegation differently. The repo's guidance is
host-agnostic; the host examples below are illustrative.

| Host | How sub-agents are dispatched |
|---|---|
| Claude Code | `Task` (a.k.a. `Agent`) tool. Sub-agents have separate context windows; the parent gets a single message back. |
| Cursor | Subagent prompts inside an Auto rule, or a separate chat tab. |
| Codex CLI | `codex exec` for a bounded task, optionally on a worktree branch. |
| Generic AGENTS.md | Phrased as instructions ("Run a sub-agent that …"); no protocol enforcement. |

When authoring a skill, **write the delegation in general agent terms** ("Run a
read-only sub-agent that maps the file's call graph") rather than tying it to
one host's tool name.

## Anti-patterns

- **Delegate-then-wait.** If the parent cannot proceed without the result,
  inline the work. Delegation is for parallel side-quests.
- **Re-implement the leaf skill.** Meta-skills should call out to leaf skills
  by name. If you find yourself copying body content from `trove-review` into
  `trove-ship`, stop.
- **Speculative `benefits-from`.** Don't list five potentially-related skills
  to look thorough. The list grows stale and the cycle warning fires.
- **Unbounded sub-agent prompts.** "Look at the codebase and tell me what
  could be improved" returns 4000 tokens of nothing useful.

## What this phase does *not* do

- No execution engine for `benefits-from` (P4/P5 territory).
- No persistent learning about which delegations succeeded (P4).
- No host-specific subagent-config rewriting (deferred).
- No automatic eval of meta-skill output quality (P5).

The artifact you get out of P3 is: clear authoring guidance, two believable
meta-skills, advisory relationship metadata, and a CLI surface that exposes it.
