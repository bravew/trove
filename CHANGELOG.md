# Changelog

All notable changes to Trove will be documented here. Calendar-versioned
(`YYYY.M.D`) — see [docs/contributing.md](docs/contributing.md) for the
release process.

## Unreleased

### Behavior changes — read before upgrading

- **`trove-ffmpeg` now requires FFmpeg 6.1+ and Python 3.10+.** It moved from
  upstream 2.5.1 to 3.2.3. The 3.0 release changed the cut defaults, so a cut
  that previously re-encoded may now stream-copy unless you ask for a
  frame-exact cut. New references cover flags, reports, requests, timestamps,
  and the workflow.
- **`trove-react-view-transitions` targets stable React 19.3.** `<ViewTransition>`
  and `addTransitionType` shipped in React 19.3, so the skill no longer tells
  Vite projects to install `react@canary`.
- **`trove-pulse` no longer offers the browser-cookie and CDP lanes.** The sync to
  upstream `7869eb17` (v3.32.0) excludes `agentcookie.py`, `chrome_cdp.py`, and
  `box_chrome_login.py`, and the setup wizard no longer describes them. The three
  cookie modules that already shipped are unchanged. `reddit_rss.py` is gone
  because upstream deleted it.
- **`trove-pulse-cn` is now upstream 4.0.0.** It adds the hot-search board, the
  overseas opt-in, and a `login <platform>` flow that stores a session the user
  creates in its own config directory. It does not read the browser's cookie
  store. The hot-board image is excluded.
- **New sound effects need a provenance record.** `trove-product-video`,
  `trove-beat-sync`, and `trove-video-review` follow upstream's retirement of its
  shared effect library. CC0 is the default, CC BY only when the credit ships with
  the video, and the template project's bundled audio is historical material for
  preview, not a source pool.

- **Auto-attach now works in Claude Code.** Skills declaring
  `auto_attach.globs` never emitted Claude's `paths` field, so they never
  auto-attached. They do now. Ten skills are affected, several with broad
  patterns: `trove-typescript` (`**/*.ts`, `**/*.tsx`), `trove-python`
  (`**/*.py`), `trove-react` (`**/*.tsx`, `**/*.jsx`), `trove-a11y`
  (`**/*.tsx`, `**/*.jsx`, `**/*.vue`, `**/*.html`), `trove-vue`,
  `trove-swift`, `trove-lambda`, `trove-terraform`, `trove-cdk`,
  `trove-docker`. If you do not want a skill loading automatically in matching
  files, remove its `auto_attach` block from `plugin.yaml` and rebuild.
- **Cursor no longer marks model-only skills as manual-only.** `user-invocable:
  false` was being emitted as `disable-model-invocation: true`, which means the
  opposite — 22 skills were hidden from the model and offered to the user
  instead. Manual-only is now an explicit declaration
  (`activation.manual: true`, or per host via `host-overrides`).
- **Installer link layout changed for Claude Code and Codex.** Fallback
  symlinks moved from `~/.claude/skills/trove/<skill>` and
  `~/.agents/skills/trove/<skill>` to `~/.claude/skills/<skill>` and
  `~/.agents/skills/<skill>`. Both hosts document a skill as
  `<root>/<skill>/SKILL.md`, so the grouping folder was read as a skill
  directory with no `SKILL.md` and nothing under it was discovered. Cursor
  keeps its grouped layout, which it documents as supported. Re-run `./setup`;
  stale links under the old paths can be removed by hand.
- **`version:` removed from `plugin.yaml` and skill templates.** Generated
  manifests have always been stamped from the repository `VERSION` file, so the
  authored values only ever drifted — `trove list` reported `v0.1.0` for a
  plugin shipping `v2026.7.4`. Validation now rejects a `version:` in
  `plugin.yaml`.

### Fixed

- `trove-take-cut` keeps a one-sample pulse as a cut with duration, accepts a
  line retaken later in the session than the line after it, and
  `verify_cut.py` rejects a word whose time range runs backwards. A
  zero-length word, which recognizers give a short filler, still passes. The
  skill now tells you to keep fillers in the transcript and to transcribe each
  reading alone, because a full-file pass can drop the "uh" that decides the
  keeper. It also says to lower `cut_points.py --threshold` on a quiet,
  noise-gated recording, where the default clipped the "s" of a word in a real
  run.
- `trove-design-review` gives every finding a severity (blocker, important, or
  suggestion) and a location, and names related states to check.
  `trove-autoplan` declines the planning pipeline for a bug fix, regression,
  or refactor and routes it to `trove-debug`, `trove-review`, and
  `trove-commit`.
- `trove-video-edit` insets portrait captions by 20% of the frame height.
  The old 8% CSS padding was calculated from the width, so it never cleared a
  vertical caption. SDR finals are rendered with `--color-space bt709`, which
  writes limited-range BT.709 tags instead of an untagged `bt470bg` matrix.
- `trove-broll-ingest` refuses a catalog entry with an empty field, a negative
  start, or a non-finite span, and writes nothing. It also refuses a select
  already catalogued under another spelling, such as `./a.mp4`.
  `trove-video-edit` rejects a plan with no source file, an unknown beat kind,
  a caption with no text, a beat that starts before the source, or two beats
  that land on the same rendered frame. `lint_plan.py` takes the frame rate
  from `--fps` (default 30), because the plan schema has no frame rate. The
  Remotion composition names `zod` as a direct dependency.
- Seventeen eval tasks now supply the material their rubric grades. Examples:
  the code that `trove-explain` must cite, the benchmark numbers that
  `trove-perf` must report, and a Vite and React Router setup that matches
  `trove-react-view-transitions`. The tasks span the view-transitions, arena,
  verify, react-best-practices, perf, explain, beat-sync, terraform, docker,
  react, autoplan, and lambda suites. Rubrics, weights, and thresholds are
  unchanged.
- The eval runner no longer fails to score a judgment when the judge's prose
  quotes code with braces, such as `{bgm: false}`, before its JSON. It now
  keeps the first fenced or balanced object that parses with a `scores` field,
  and a reply with none quotes its opening text in the error.
- `trove-lambda` shows how to check `BACKEND_IPC_TOKEN` on an inbound event,
  in constant time and before any work, and how to parse SNS delivered
  directly. It previously showed only the outbound token.
- `trove-autoplan` splits a request that bundles a bug fix with new behavior.
  The fix is routed out and the pipeline plans only the new behavior.
- The `changed-skill-quality` and skill quality report workflows run on Node
  22.23.4. On 22.12.0 the `node-gyp` that builds `better-sqlite3` crashed on
  a missing `zlib.createZstdDecompress`, so the job failed during install.
- Eval JSON extraction ignores braces inside quoted strings, including escaped
  quotes and backslashes. A valid rationale containing `}` no longer truncates
  the response before parsing.
- The Copilot install smoke reads `plugin list --json` when the CLI no longer
  writes `config.json`. Copilot 1.0.95 loads plugins live from the marketplace
  directory instead of copying them, so the byte comparison had nothing to
  compare and the smoke failed before checking the inventory. The pinned 1.0.69
  job still compares copied bytes.
- The `trove-ffmpeg` source row tracked the import SHA instead of `main`, so the
  weekly check compared a stale head and reported `license-changed`. It now
  tracks `main` and pins `license.evidence_digest`, and its `upstream-version`
  and `THIRD_PARTY.md` entry read 2.5.1.

### Added

- `trove-take-cut`, `trove-broll-ingest`, and `trove-video-edit` in
  `trove-media`. The first cuts a raw multi-take recording to one keeper per
  line, taking cut points from the waveform rather than the transcript. The
  second finds the usable moments in raw footage, grades each from the probed
  transfer, and catalogs it in a library the user names. The third edits a
  pre-cut talking-head clip from a single plan, rendering a preview before the
  final. All three are original skills and call `trove-ffmpeg` for the cutting,
  grading, and audio. `trove-broll-ingest` ships four LUT grades under
  `assets/luts/`.
- `trove-media` plugin with `trove-ffmpeg`, a vendored and byte-synced copy of
  `kajisho5/ffmpeg-skill` (MIT, tracked at 2.5.1). It cuts, joins, reframes,
  captions, normalizes loudness, exports for YouTube, Reels, TikTok, and X, and
  runs delivery checks across 42 tools. Trove adds a thin front and relocates
  the upstream spec to `references/runtime-spec.md`. Two recorded transforms
  keep `render.py` and `_contract.py` working inside the bundle. It needs
  `ffmpeg` and `ffprobe` on `PATH`, and `python3` 3.9 or later. A smoke run on
  a real clip is recorded in `dev-doc/media-verification/issue-26.md`.
- `/import-skill` and `bun run import:skill` import an external skill after an
  inspected review. The importer reports the license, size, hard rejects, and
  flags, then stages a vendored or adapted skill with its `upstream.yaml`
  provenance. Source content is treated as data. See "Importing an external
  skill" in `CONTRIBUTING.md`.
- Update reports that apply changes end with a review checklist, so the
  workflow's PR body carries it.
- Agent Skills spec conformance is a blocking gate. `bun run validate` checks
  every strict artifact against `scripts/lib/agent-skills-spec.ts`, written
  in-repo from the published specification and pinned to a recorded
  `SPEC_REVISION`. `skills-ref` runs as a non-blocking advisory cross-check in
  CI only.
- `trove-research` plugin with two vendored last-30-days skills: `trove-pulse`
  (global/English platforms, wrapper + on-demand spec) and `trove-pulse-cn`
  (Chinese platforms, direct import). Neither auto-attaches; both run keyless
  with stdlib Python. Cookie/browser access is opt-in, default off.
- Gemini CLI receives skills. Extensions now bundle their plugin's skills under
  `skills/`, declare the required `name`/`version`/`description`, and the same
  files are written to the `.agents/skills` workspace root. Previously Gemini
  received only `GEMINI.md`.
- OpenCode skills moved to `.agents/skills`, one of its documented discovery
  roots; `output/opencode/skills` was not a discovery root at all.
- `./setup` gained `--host opencode`, `--host gemini`, and `--uninstall`. Every
  link it creates is recorded in `~/.trove/installed-links.tsv`, and an entry it
  did not create is never overwritten.
- `docs/host-matrix.md` — discovery roots, honored frontmatter, test method,
  source URL, and verification date per host.
- `bun run validate:claude-manifests` runs `claude plugin validate --strict`
  over all plugins and the marketplace; CI runs it on every PR.
- `bun run test:acceptance:setup` proves the installer layout, collision
  handling, idempotence, and reversibility in a disposable `HOME`.
- Marketplace manifests now carry the `category` and `keywords` Trove already
  curates in `marketplace.yaml`.

### Changed

- The eval judge runs on `claude-sonnet-5-5` at explicit effort `high`, sends the
  server-side default refusal fallback, and records the served model and whether
  a fallback was used. A refusal or a truncated response fails with a named error
  instead of a score. `security-reviewer` uses `opus`.
- An eval run that stops on a rate limit or an unreachable judge keeps the scores
  it already has. The results file gains an `aborted` field naming the cause and
  the task it stopped on. `EVAL_SKIP_SKILLS` names suites to leave out when
  collecting the rest. That run records them in `skippedSkills`, and `--gate`
  exits 1 for it even when every selected task passes.
- `trove-pulse` checks a Hacker News submission's body as well as its title, and
  a multi-word topic must match its longest word. A title-only check dropped
  stories that name the topic in the body and kept ones that matched a filler
  word.
- Upstream sync can vendor `scripts/**`, apply `replace-literal` rewrites,
  exclude Trove-authored files from the lock via `local_only`, and raise size
  caps per artifact. `bun run validate` secret-scans skill `scripts/**`
  `.py` / `.js` / `.mjs` files.
- Host frontmatter is rebuilt from an explicit per-host allowlist
  (`scripts/lib/projection.ts`) rather than string-stripped in place. Trove's
  authoring vocabulary — `preamble-tier`, `activation`, `triggers`,
  `benefits-from`, `host-overrides` — no longer reaches any host. `triggers`
  becomes Claude's `when_to_use` and folds into `description` for strict hosts.
- `allowed-tools` is withheld from hosts that ignore it. The spec's
  space-separated encoding cannot represent `Bash(git *)`, so those hosts were
  receiving corrupt tokens.
- Eval judge runs on `claude-sonnet-5` with adaptive thinking and an 8192-token
  cap. On Sonnet 5 `max_tokens` bounds thinking plus output, so the previous
  1024 could truncate the judge's JSON and read as a quality regression; a
  truncated response now fails with that explanation. Token usage is recorded in
  `evals/results.json` so a model change can be read as score-vs-cost.
- Dependencies: `@anthropic-ai/sdk` 0.92 → 0.122, TypeScript 6 → 7. No tool
  imports the compiler API, so the TypeScript 7 bump needed no compatibility
  package. CI installs with `bun ci`.
- Skill-triggering fixtures renamed from the project's former `stan-*` naming to
  the `trove-*` skills they actually test; the runner now rejects a fixture that
  does not name a real skill.

### Notes

- Initial public release.
## [2026.11.10] - 2026-11-10

### What's Changed
* feat(media): video-shotcraft skills for trove-media by @bravew in https://github.com/bravew/trove/pull/63
* feat(design): import pinned diagram-design skill by @bravew in https://github.com/bravew/trove/pull/66


**Full Changelog**: https://github.com/bravew/trove/compare/v2026.10.8...v2026.11.10

## [2026.10.8] - 2026-10-08

### What's Changed
* feat(media): trove-media plugin with trove-ffmpeg by @bravew in https://github.com/bravew/trove/pull/55


**Full Changelog**: https://github.com/bravew/trove/compare/v2026.10.7...v2026.10.8

## [2026.10.7] - 2026-10-07

### What's Changed
* ci: run PR checks on epic/** integration branches by @bravew in https://github.com/bravew/trove/pull/35
* docs(media): add import, ffmpeg, and shotcraft implementation plans by @bravew in https://github.com/bravew/trove/pull/36
* feat: /import-skill for importing external skills by @bravew in https://github.com/bravew/trove/pull/44


**Full Changelog**: https://github.com/bravew/trove/compare/v2026.10.5...v2026.10.7

## [2026.10.5] - 2026-10-05

### What's Changed
* feat(doc): add Obsidian and web clipping skills by @bravew in https://github.com/bravew/trove/pull/8
* Give each plugin a logo from plugin.yaml by @bravew in https://github.com/bravew/trove/pull/11


**Full Changelog**: https://github.com/bravew/trove/compare/v2026.9.10...v2026.10.5

## [2026.9.10] - 2026-09-10

### What's Changed
* feat: first-class GitHub Copilot support, quality gates, external intake, and upstream pilots by @bravew in https://github.com/bravew/trove/pull/7


**Full Changelog**: https://github.com/bravew/trove/compare/v2026.8.29...v2026.9.10

## [2026.8.29] - 2026-08-29

### What's Changed
* Host projection contract, Agent Skills conformance, and installer layout fixes by @bravew in https://github.com/bravew/trove/pull/1
* feat(upstream): add deterministic vendored skill sync by @bravew in https://github.com/bravew/trove/pull/2
* build(deps): bump actions/upload-artifact from 4.6.2 to 7.0.1 by @dependabot[bot] in https://github.com/bravew/trove/pull/3
* build(deps): bump actions/checkout from 4.4.0 to 7.0.1 by @dependabot[bot] in https://github.com/bravew/trove/pull/4
* feat(research): vendor last30days as trove-pulse and trove-pulse-cn by @bravew in https://github.com/bravew/trove/pull/5
* fix(ci): unblock release push to protected main by @bravew in https://github.com/bravew/trove/pull/6

### New Contributors
* @bravew made their first contribution in https://github.com/bravew/trove/pull/1
* @dependabot[bot] made their first contribution in https://github.com/bravew/trove/pull/3

**Full Changelog**: https://github.com/bravew/trove/commits/v2026.8.29

