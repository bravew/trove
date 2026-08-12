---
name: trove-perf
description: |
  Diagnose and fix a measured performance problem against a baseline: measure first, fix, re-measure, and cite the delta with an artifact path.
  Use for slow endpoints, slow queries, or any "make this faster" backed by a measurement.
version: 1.0.0
preamble-tier: 2
user-invocable: true
triggers:
  - this is slow
  - optimize performance
  - measure and improve
benefits-from:
  - trove-verify
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# trove-perf

Optimize against numbers, not vibes. Every perf claim ties to a before/after measurement.

## Workflow

1. **Baseline.** Capture a measurement of the current behavior (timing, query plan, trace, profile) and save the artifact. Don't skip to reading source — measure first.
2. **Locate the cost.** Use the baseline to find where the time actually goes (the slow query, the N+1, the hot frame), not where you assume it is.
3. **Fix the measured cost.** The smallest change that addresses what the measurement showed.
4. **Re-measure.** Same method as the baseline, same inputs.
5. **Cite the delta.** Report baseline, post-fix, and the delta, with the path to the artifact (trace file, query plan, timing run). A fix with no re-measurement is not done.

## Anti-patterns

- **Reading the code instead of measuring.** The bottleneck is rarely where it looks; profile.
- **Optimizing an unmeasured path.** If the baseline doesn't show it's hot, don't.
- **Claiming a win without a re-measure.** "Should be faster" is not a result.

## Output

```
Baseline:  <metric> (artifact: <path>)
Post-fix:  <metric> (artifact: <path>)
Delta:     <improvement>
Change:    <what was done, tied to the measured cost>
```
