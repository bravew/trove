---
name: trove-tdd
description: "Write a focused regression test that fails before the fix and passes after. Use when the user asks for TDD, a failing test, or a regression test, or when a bug has a cheap local test target. Skip when the test path is expensive, integration-heavy, or unclear."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# trove-tdd

Write the test that fails for the right reason before you change the code. The test encodes intended behavior, not the current implementation.

## Workflow

1. Understand the intended behavior — what should be true that currently isn't.
2. Choose the narrowest check that exercises it (unit over integration over E2E).
3. Write a test that fails *before* the fix, for the reason you expect.
4. Run it and confirm it fails on that reason — not a typo or a missing import.
5. Make the smallest fix.
6. Re-run; confirm it passes.
7. Run nearby tests to catch fallout.

## When to skip (escape hatch)

Prefer no new test over a bad test. Skip — and say why — when:

- The only path is a slow E2E flow or a broad harness with heavy setup.
- Reproducing it needs brittle mocks that would assert implementation detail, not behavior.
- The test target is genuinely unclear.

A bad test is one that passes when the bug is present, asserts on incidental implementation, or is so slow/flaky it gets disabled. Don't write it to look thorough.

## Output

Report the evidence, not just the outcome: name the run that failed before the fix and the run that passed after (e.g. `pnpm test reducer.test.ts` red → green). If you skipped the test, state the reason in one line.
