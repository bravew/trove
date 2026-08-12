---
name: trove-verify
description: Completion verification workflow. Use before claiming done, fixed, complete, ready, or shipped.
version: 1.0.0
preamble-tier: 3
user-invocable: true
triggers:
  - verify this
  - before done
  - completion check
  - claim done
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-verify

Before claiming done: run the tests, reread the diff, list the unverified assumptions.

## Verify the real thing

"It compiles", "the build passed", or "the screenshot rendered" is not verification of behavior. Check the actual artifact the change was supposed to affect: the running endpoint returns the right body, the rendered UI shows the right pixels, the migration moved the right row count. Name what you checked.

When a check will be re-run, script it as a deterministic, re-runnable comparison (old value vs new value) rather than a one-off glance. When work was delegated to a sub-agent, trust the git diff and the artifacts it produced — never its prose summary of what it did.

## Self-check

1. Run the most relevant test, lint, typecheck, build, or manual inspection.
2. Reread the touched diff for unintended churn and user-owned changes.
3. Confirm generated artifacts are fresh when generators are involved.
4. Name any verification that could not run and why.

## Decision Gate: completion claim

Context: A completion claim is only useful if it says what was actually proven.
Question: Is the requested outcome verified?
Options:
- A. Yes - summarize changes and verification.
- B. Partially - summarize changes and call out the gap.
- C. No - keep working or ask for the missing input.
Default: C, because unverified work is not complete.

## Output

Use concise prose: what changed, what passed, and what remains unverified.
