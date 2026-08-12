---
name: trove-show-work
description: |
  Keep a reviewable decision trail for long-running or unattended work: an append-only TSV log with one row per decision (what, why, evidence, result).
  Use for autonomous or multi-phase runs, or work a human reviews after stepping away.
version: 1.0.0
preamble-tier: 2
user-invocable: true
triggers:
  - keep a decision log
  - show your work
  - audit trail for this run
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# trove-show-work

Maintain one canonical decision log so a reviewer can reconstruct an unattended run without replaying it. Local by default; commit it when a reviewer needs the trail to trust the result.

## The log

One TSV file, append-only, one row per decision. Columns: `ts`, `phase`, `decision`, `why`, `evidence`, `result`. TSV because GitHub renders it as a sortable table and `column -s$'\t' -t file.tsv` reads it in a terminal. Template: [references/decision-log-template.tsv](references/decision-log-template.tsv).

Use the helper so timestamps and the formula-injection guard are consistent:

```bash
scripts/log.sh decisions.tsv "<phase>" "<decision>" "<why>" "<evidence>" "<result>"
```

- **Append-only.** A wrong call doesn't get edited away — add a new row that supersedes it and say so in `result`. The history is the point.
- **Evidence is mandatory.** The `evidence` cell points at the real thing (a command output, a file:line, a metric), not "looks right".

## Self-audit before handoff

Read the log against what actually happened this session. Fix the log, not the story: if a row claims an outcome the transcript doesn't support, correct the row. Optionally get a second opinion from a fresh read (a sub-agent) and add an "Attention" row for anything a reviewer must look at.

## Why not prose

A narrative paragraph hides the decision points. One row per decision makes a skipped verification or an unsupported claim visible at a glance.
