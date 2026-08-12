---
name: trove-autoplan
description: |
  Front-door planning workflow. Take an idea and produce implementation-ready
  output by composing the Trove product skills (spec → user stories →
  release-note preview). Defers all detail to the leaf skills it calls.
version: 1.0.0
preamble-tier: 4
user-invocable: true
triggers:
  - autoplan
  - turn this idea into a plan
  - draft an implementation plan
  - end-to-end planning
benefits-from:
  - trove-spec
  - trove-user-story
  - trove-release-notes
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

You are an orchestrator: when a step maps to another skill (e.g., review, security-review, design-review), call out the delegation explicitly rather than re-implementing it inline.

# trove-autoplan — End-to-end Planning Workflow

`trove-autoplan` is an **orchestrator**, not a leaf skill. It runs the user's
idea through three planning stages and stops at decision gates so the user
stays in control. Every stage delegates to a specialist skill rather than
re-implementing the detail.

## Inputs

- A short statement of the idea, problem, or feature ("we want to add
  passkey login").
- Optional: target release window, audience, constraints.

## Workflow

### Stage 1 — Frame the spec

Hand off to **`trove-spec`**. Use it to produce a structured feature spec
(problem statement, user stories, acceptance criteria, technical notes).

> Stop here if the spec exposes a critical unknown (e.g., the team hasn't
> decided which auth provider to integrate with). Surface a Decision Gate
> before continuing.

### Stage 2 — Decompose into stories

Hand off to **`trove-user-story`**. Generate one well-formed user story per
acceptance criterion produced in Stage 1. Each story should include edge
cases and test scenarios — that's what `trove-user-story` enforces.

### Stage 3 — Preview the release framing

Hand off to **`trove-release-notes`**. Draft the user-facing release-note
shape ahead of time, even though the work hasn't shipped. Doing this early
catches scope ambiguity ("can we describe this in one sentence?") before
implementation starts.

## Decision Gate: scope of stage 1

Context: Spec depth determines how much downstream work the meta-skill drives.
Question: Should the spec be exhaustive or first-pass?
Options:
- A. First-pass (default) — capture the shape, stop at first major unknown.
- B. Exhaustive — drive every section to completion before stage 2.
Default: A, because exhaustive specs hide unknowns under detail and Stage 2 will surface them anyway.

## Output

A consolidated planning packet:

```markdown
# <feature> — Plan

## Spec
<from trove-spec>

## Stories
<from trove-user-story, one per acceptance criterion>

## Release framing
<from trove-release-notes, preview only>

## Open questions
<aggregated from stages 1-3>
```

## Anti-patterns

- **Don't inline spec/story/notes content here.** If you're tempted to copy
  guidance from `trove-spec` into this skill, stop — call out to it instead.
- **Don't skip Stage 3.** The release-note preview catches "we can't explain
  this concisely" problems before code is written.
- **Don't run the stages in parallel.** Each stage feeds the next.
