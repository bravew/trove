---
name: trove-explain
description: "Explain code, architecture, or data flow at the appropriate level for the audience. Use when someone needs to understand unfamiliar code, a module, or system design."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Code Explanation Skill

## Complexity gate

Size the effort to the subsystem before diving in:

- **Simple** (one module, one flow): explain it in a single pass.
- **Complex** (multiple subsystems, unclear ownership): fan out 2-4 bounded, read-only sub-agents to map distinct areas in parallel, then synthesize their findings into one mental model. Use the delegated-exploration phrasing in [docs/orchestration.md](../../docs/orchestration.md); fan out only when the subsystem warrants it (parallel agents cost linearly).

Read the actual code. Do not guess behavior from file or symbol names — the name lies often enough that a guess is the most common explanation failure.

## Approach

When explaining code or architecture:

1. **Start with the "why"** — what problem does this solve?
2. **Show the big picture** — how does it fit in the larger system?
3. **Walk through the flow** — trace data from entry to exit
4. **Highlight the non-obvious** — gotchas, trade-offs, design decisions

## Explanation Levels

Adapt your explanation depth to the audience:

| Level | Audience | Focus |
|-------|----------|-------|
| **High** | PM, Designer | What it does, user impact |
| **Mid** | New developer | How it works, key patterns |
| **Deep** | Experienced dev | Why decisions were made, edge cases |

## Output Format

```markdown
## What This Does
One-paragraph summary of purpose and behavior.

## Architecture
How components connect (use diagrams when helpful).

## Key Flow
Step-by-step trace through the main path.

## Design Decisions
Why it's built this way (trade-offs, alternatives considered).

## Gotchas
Things that might surprise you or cause bugs.
```

## Critique mode (optional)

When asked to critique (not just explain) the architecture, explain first, then surface findings and sort each into: **Act on** (real problem, worth fixing now), **Consider** (worth weighing), **Noted** (minor), **Dismissed** (raised and rejected, with the reason). Keep it lightweight; the heavyweight adversarial pass is `trove-review`'s deep mode.

## Best Practices

- Use code snippets to illustrate, but annotate them
- Prefer diagrams (ASCII or mermaid) for architecture
- Link to related code files when referencing them
- Keep explanations under 500 words unless requested otherwise
