---
name: trove-refactor
description: "Behavior-preserving change to structure: rename, extract, inline, dedupe, move, or migrate an internal API. Pin behavior first, migrate callers and delete the legacy API in one wave, prove behavior unchanged on the real artifact. Use for refactors and internal-API migrations."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-refactor

A refactor changes structure while holding behavior constant. The discipline is proving that "constant" is true.

## Workflow

1. **Pin the behavior.** Characterization test or snapshot of current behavior first. A type-check and a lint passing are **not** a behavior pin — they don't catch a changed result.
2. **Name the target shape.** What the structure should be after (use `trove-architect` for non-trivial reshapes).
3. **Subtract before adding.** Remove dead weight and duplication first, then build on the simpler base.
4. **Small behavior-preserving steps.** Migrate callers and delete the legacy API in the same wave (`trove-principle-migrate-then-delete`); don't leave a compatibility shim.
5. **Prove it unchanged.** Re-run the pinned behavior against the real artifact — same inputs, same outputs. `trove-verify`.
6. **Confirm reader load dropped.** If the change didn't make the code easier to trace, question whether it earned its place.

## Anti-patterns

- **Smuggling behavior change into a refactor.** If behavior must change, that's a separate, named change with its own test — split it out.
- **Calling a green type-check "proof".** Behavior parity needs a behavioral check, not a compile.
- **Leaving the old API alive "just in case."** That's two ways to do one thing; delete it in the same wave.

For a large or cross-cutting refactor (a migration across many call sites), treat each component as its own small step with its own behavior pin.
