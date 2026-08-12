---
name: trove-arena
description: "Spawn N parallel candidate attempts at one hard, novel artifact, pick the strongest base, graft the best ideas from the losers into it, then verify. A heavyweight technique — most work routes to trove-architect instead. Use only for a genuinely novel, hard-to-reverse design decision with no precedent."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-arena

Fan out several independent attempts at the same hard problem, then synthesize the best of them. This is expensive — N parallel agents cost N times the tokens. Use it only when one attempt would lock in the wrong shape and the decision is hard to reverse. For ordinary non-trivial work, use `trove-architect`.

## Phases

1. **Frame.** State the problem and write the **rubric** (3-6 concrete, gradeable criteria) *before* spawning. The rubric is the picker's tool; candidates never see it.
2. **Fan out.** Spawn N candidates on the same task. **Each writes to its own isolated path** — a separate worktree (`trove-worktree`) or `/tmp` dir — so they never share state. Keep N small (2-4); more is rarely worth the cost.
3. **Cross-judge.** Read-only pass on a fresh context that scores each candidate against the rubric. Run it after candidates finish, not while they write (a judge reading mid-write sees empty output).
4. **Pick a base.** The strongest candidate overall, by the rubric.
5. **Graft.** Hand-port the best ideas from the losing candidates into the base. Record why each rejected candidate lost — the rejection notes are the highest-signal part of the record.
6. **Verify.** Prove the grafted result works (`trove-verify` / its own tests).

## Convergence vs divergence

If candidates converge on the same approach, that consensus is a strong signal — ship it. If they diverge sharply, that means the problem is underspecified: reframe it, don't average the candidates into mush.

## When not to use

Mechanical changes, bug fixes, or anything with an obvious single approach. Sending those to the arena burns tokens for no gain — `trove-architect` or a direct change is correct.
