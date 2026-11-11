# Local verification, 2026-11-10

The working tree is on `feat/november-refresh`, based on `261a436`. The work
is uncommitted. These checks cover the implementation and generated artifacts;
they do not replace live evals or media acceptance.

| Command | Result | Log |
|---|---|---|
| `bun run build` | Exit 0 | `/tmp/trove-sync/final-build.log` |
| `bun test ./tests` | 477 passed, 0 failed | `/tmp/trove-sync/final-tests.log` |
| `bun run verify:generated` | Exit 0; artifacts current, generators deterministic | `/tmp/trove-sync/final-generated.log` |
| `bun run validate` | Exit 0; no warnings reported | `/tmp/trove-sync/final-validate.log` |
| `bun run validate:claude-manifests` | Exit 0 | `/tmp/trove-sync/final-manifests.log` |
| `git diff --check` | Exit 0 | No output |
| `bun run sync:upstream -- --check --offline` | Exit 0; all 9 vendored artifacts report `no-changes` | Local bytes and patch digests verified; no upstream network comparison |

The validator checked 69 registered skills, 9 upstream locks, 276 strict
Agent Skills outputs across four hosts, and 9 Copilot native manifests with
69 bundled skills. Strict Claude validation passed for all plugin manifests
and the marketplace.

Media evidence lives in the wave A and wave B notes under
`dev-doc/media-verification/`. Original judge scores remain in
`2026-11-judge-baseline.tsv`; follow-ups must be identified separately.

The local checks do not establish these outcomes:

- A green full live eval gate. The original baseline is red; selected-suite
  follow-ups are separate runs and cannot turn that run green.
- A real multi-take speech acceptance run. The user selected a synthetic
  substitute, and its fresh transcript matches both expected lines exactly.
- FFmpeg caption burning or stabilization through missing local filters.
  The recorded doctor result lacks `drawtext`, `subtitles`, `vidstabdetect`,
  and `vidstabtransform`. Remotion captions use a different rendering path.
- Live testing of the retained browser-cookie lane. D2a keeps it as-is;
  the live research smoke used browser cookies disabled.
- Delivery certification of the video finals. Their review must identify
  missing brief, storyboard, brand, and data-policy evidence explicitly.
