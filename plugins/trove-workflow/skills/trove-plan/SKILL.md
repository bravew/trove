---
name: trove-plan
description: "Implementation planning workflow. Use after brainstorm approval or for multi-step work that needs verifiable checkpoints."
when_to_use: "write a plan; implementation plan; break this down; multi-step change"
user-invocable: true
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-plan

A plan is a sequence of verifiable checkpoints, not a wish list.

## Throughput checkpoint

Before sequencing, answer four questions so the plan parallelizes safely and doesn't serialize work that's actually independent:

1. **Blocking first steps** — what must land before anything else can start?
2. **Independent workstreams** — what can proceed in parallel (disjoint files/subsystems)?
3. **Shared mutable state** — what would two parallel workstreams both write? Eliminate the sharing or serialize that part.
4. **Smallest safe decomposition** — the fewest checkpoints that each verify independently.

Keep an n/a answer in the list with a one-line reason rather than dropping it. Prefer several small checkpoints over a few large ones, staying within the seven-checkpoint cap below; each must be independently verifiable (static + runtime).

## Plan Shape

Create at most seven checkpoints. Each checkpoint must include:

- The files or subsystem likely touched.
- The observable result after the checkpoint.
- The verification command or inspection needed before moving on.

## Decision Gate: plan readiness

Context: Execution should start only when the checkpoints are independently verifiable.
Question: Is this plan concrete enough to execute one checkpoint at a time?
Options:
- A. Yes - execute checkpoint 1.
- B. Revise the plan.
- C. Stop for missing information.
Default: B, because vague checkpoints make verification meaningless.

## Handoff

When the user approves the plan, route to `trove-execute-plan`. Do not execute while still drafting the plan unless the user has explicitly asked for immediate implementation and the change is narrow.
