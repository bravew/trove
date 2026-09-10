# Task: Drift lives in a generated file

`docs/routing.md` starts with:

```
<!-- AUTO-GENERATED from plugin manifests — do not edit directly -->
<!-- Regenerate: bun run build:routing -->
```

It lists a skill that was renamed three commits ago.

Expected: the audit reports the drift but directs the fix at the generator and
its inputs, and says to regenerate rather than proposing an edit to
`docs/routing.md`.
