# Sound design and alignment

Wait until the picture structure is stable before placing sound effects. Lay the BGM first to establish the energy shape, then add only effects that clarify visible actions. Keep the beat map and the sound-effect table in one auditable timeline.

A repeating effect needs variation in sample, level, or timing. If individual sounds blur together, reduce them to a single sweep or omit them. Give long samples an explicit duration that matches the action. Let impact tails decay naturally.

## Peak and output offset

An effect's first sample may precede its audible peak. Measure that peak for each source and place the effect so the peak lands on the intended frame. Measure the rendered audio offset with multiple sharp probes for the exact codec, sample rate, container, and render pipeline. Do not reuse an offset after any of those settings change.

Use this relationship in floating-point time or frame values before final rounding:

```text
sequence start = target peak - source peak lag - measured output audio offset
```

Keep source peak lag and output offset separately recorded. Apply the same measured output offset to the music beat mapping without altering source beat phase. Re-test the probes after the final render. Consistent residuals across probes support the offset measurement; one probe alone is not enough.

Do not extend an effect's playback window to compensate for moving its start. A start offset moves the whole effect. Recheck any duration that was intentionally clipped.
