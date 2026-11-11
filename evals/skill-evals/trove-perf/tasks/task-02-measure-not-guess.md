# Task: Challenge an assumed performance cause

"This list render is slow. I'm pretty sure it's the sort, so I'll memoize the comparator. Sound good?"

This is a fictional performance investigation. The following artifacts are synthetic scenario data, not measurements of this repository or results you have run. Use them as the exercise's evidence and label any reported numbers accordingly. No live profiler or app is available.

The fixture list has 1,000 immutable records. `renderList` sorts a copy, formats labels, then appends each row and reads its bounding rectangle before appending the next row. The suggested comparator change has not been benchmarked.

`fixtures/perf/list/baseline.json` was captured in the scenario before any change:

```json
{
  "revision": "list-v1",
  "harness": "list-scroll-v1",
  "environment": "fixed Chromium viewport, 1000 seeded rows, 10 warmups, 30 runs",
  "medianMs": 80,
  "p95Ms": 96,
  "medianBreakdownMs": {"sort": 2, "format": 17, "domAndLayout": 61},
  "layoutTrace": "1000 interleaved row writes and forced geometry reads"
}
```

For a second stage of the exercise, suppose a patch `list-v2-batched-layout` has been reviewed: it collects row nodes, appends them together, then performs geometry reads after the writes. Sort and label formatting are unchanged. The same scenario harness produces `fixtures/perf/list/batched-layout.json`:

```json
{
  "revision": "list-v2-batched-layout",
  "harness": "list-scroll-v1",
  "environment": "fixed Chromium viewport, 1000 seeded rows, 10 warmups, 30 runs",
  "medianMs": 24,
  "p95Ms": 31,
  "medianBreakdownMs": {"sort": 2, "format": 17, "domAndLayout": 5},
  "rowOrderAndLabelsEqual": true
}
```

Respond first to the comparator proposal using the baseline. Then assess whether the supplied second-stage patch addresses the measured cost, and report the supported before/after result with artifact references. Explain the comparison you would reproduce on a real checkout. Do not present the synthetic replay as a benchmark you executed or extrapolate it to production.
