---
name: trove-reflect
description: |
  Mine the current session for durable learnings and route each into a concrete edit — a skill change or a learnings entry — never auto-applied.
  Use when the user says "reflect", or after a session that surfaced a recurring correction or a non-obvious project quirk.
version: 1.0.0
preamble-tier: 3
user-invocable: true
triggers:
  - reflect on this session
  - what did we learn
  - capture learnings
benefits-from:
  - trove-write-skill
  - trove-principle-encode-in-structure
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-reflect

Turn what this session taught into something that persists. The output is a routed set of edits, presented for approval — not silently applied.

## Workflow

1. **Mine** the session for durable learnings: recurring corrections, non-obvious project quirks, validated approaches. Skip one-shot bug fixes (the commit captures those) and obvious facts.
2. **Route each learning** to where it belongs:
   - **Project-specific quirk or preference** → a `learnings.jsonl` entry (`trove learnings log`), local and per-project.
   - **Reusable workflow rule** → a concrete `trove-*` skill edit (via `trove-write-skill`).
   - **Better as a check** → structural enforcement (a lint, a rubric criterion, a script) per `trove-principle-encode-in-structure` — prefer this over more prose.
3. **Present, don't apply.** Show the routed learnings and wait for explicit approval before editing any skill. Skill changes affect every future agent in the org, so a human signs off.

## Guardrails

- **Never auto-edit a skill.** Propose the edit; the human approves.
- **Structural beats textual.** If a learning is better encoded as a lint or rubric than as another sentence in a skill body, route it there.
- **One-off ≠ durable.** A preference stated once and contradicted later is noise; require it to actually recur before encoding it.
