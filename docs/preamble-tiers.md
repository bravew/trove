# Preamble Tiers

Skills inject a small preamble at the top of their generated body via the
`{{PREAMBLE}}` placeholder. Four tiers exist; pick the smallest one that
serves the skill's purpose.

| Tier | When to use | Tokens (approx) | Contents |
|:---:|---|---:|---|
| 1 | Quiet utility output, no session bootstrap needed | ~10 | Version stamp |
| 2 | **Default for most skills** | ~30 | Tier 1 + ethos + project-pattern preference |
| 3 | Skills that benefit from cross-skill awareness | ~55 | Tier 2 + routing/project-guidance pointer |
| 4 | Front-door orchestrators (review pipelines, ship workflows) | ~85 | Tier 3 + delegation reminder |

## Selecting a tier in a template

```yaml
---
name: trove-foo
description: …
---

{{PREAMBLE}}        # Tier 2 (default)
```

```yaml
{{PREAMBLE:1}}      # Tier 1 — minimal version stamp
{{PREAMBLE:3}}      # Tier 3 — adds routing pointer
{{PREAMBLE:4}}      # Tier 4 — orchestrator
```

The resolver lives in `scripts/resolvers/index.ts`. Tier source files are in
`templates/preamble-tier-{1,2,3,4}.md` — each tier file may itself reference
`{{VERSION}}` and is resolved before injection.

## Tier 1 — quiet

Use when a skill's body is already self-explanatory and you don't want to
spend tokens on session framing. Examples: pure formatting helpers,
generators that produce machine-readable output (release notes, commit
messages), terse utility skills.

## Tier 2 — default

The right default. Establishes that the skill ships Trove conventions
and asks the agent to prefer existing project patterns over generic best
practices when they conflict. This last line matters: without it, agents
default to generic advice that doesn't match the host project's idiom.

## Tier 3 — routing-aware

Adds a one-line pointer to `AGENTS.md` (or `docs/routing.md` in the
marketplace itself) so the agent knows other skills exist nearby. Use when
the skill's natural workflow may overlap with sibling skills — e.g.,
`trove-spec` could reasonably hand off to `trove-user-story`, so being
routing-aware is a small win.

## Tier 4 — orchestrator

For front-door skills that compose other skills. Adds a delegation
reminder so the agent calls out cross-skill handoffs (review,
security-review, design-review) rather than re-implementing them inline.
Reserve for skills that are explicitly orchestrators — pulling tier 4 into
a leaf skill is wasteful.

> Tier 4 does **not** include persistent state, upgrade checks, or memory.
> Those land in P4 of the agentic upgrade plan.

## Authoring guidance

- Pick the smallest tier that conveys the necessary framing.
- Don't add per-skill preamble text via `{{PREAMBLE}}` — it would duplicate
  across every skill and rot quickly. Add to the tier file instead, or
  write the framing inline in the skill body.
- Keep tiers short. The token budget above is a soft ceiling; each tier
  should fit on a screen.
- New tiers (5+) are out of scope for P2. If you need richer behavior,
  open an issue rather than expanding the tier ladder.
