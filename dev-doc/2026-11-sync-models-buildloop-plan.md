# November sync: upstream refresh, model-generation update, and BuildLoop video skills

**Status:** Implemented and verified 2026-11-11, within the scope set by D7 to D10. CP2: every baseline failure passes on its corrected task in selected-suite follow-ups, and the full `eval:gate` on main after merge is the release check. CP6: the take cut ran on a real multi-take recording. CP7: accepted on the independent measured review (D10).
**Written:** 2026-11-09
**Repository baseline:** `main` at `ae2f668` (v2026.10.8), last commit 2026-10-08
**Builds on:** [2026-08-upstream-sync-plan.md](./2026-08-upstream-sync-plan.md),
[2026-10-trove-media-ffmpeg-plan.md](./2026-10-trove-media-ffmpeg-plan.md),
[2026-09-video-shotcraft-media-plan.md](./2026-09-video-shotcraft-media-plan.md)

The plan covers three workstreams:

1. **Upstream sync.** Bring every vendored artifact, adapted skill, and curated
   pin up to the upstream heads that exist on 2026-11-09.
2. **Model generation update.** Opus 5.5, Sonnet 5.5, Haiku 5.5, and Fable 5.2
   are released. Move the eval judge and agent definitions onto the current
   generation, and adopt the API changes that come with it.
3. **BuildLoop video skills.** Integrate `_sample/buildloop-video-skills`
   (`video-cut`, `broll-ingest`, `video-edit`, `oracle-edit`) into `trove-media`.

Section 1 records how each finding was measured, so the next sync can rerun it.

---

## 1. Findings

### 1.1 How the sync was measured

`bun run sync:upstream -- --check` **fails in the current checkout**:

```
upstream sync failed: manifest.skills: inventory mismatch; missing=[skills/design/diagram-design], extra=[]
```

The untracked `skills/design/diagram-design/` folder (an in-progress import from
`_sample/diagram-design`) is not listed in the `upstream.yaml` inventory. The
check was rerun from a clean detached worktree of `HEAD` at `/tmp/trove-sync/wt`.
Reports were written to `/tmp/trove-sync/report.{json,md}`. Local clones in
`_sample/` were already at upstream head; `vercel-labs/agent-skills` and
`cursor/plugins` have no local clone and were fetched into `/tmp/trove-sync/up`.

### 1.2 Vendored artifacts (byte-synced through `sync:upstream`)

| Artifact | Base → candidate | Result | Size of drift | Notes |
|---|---|---|---|---|
| `trove-react-best-practices` | `063bee9` → `1a2c79d` | no-changes | — | — |
| `trove-react-native` | `063bee9` → `1a2c79d` | no-changes | — | — |
| `trove-react-view-transitions` | `063bee9` → `1a2c79d` | **update-available** | 1 line in `SKILL.md` | Upstream `6ec2693`: "recommend stable React 19.3". Trivial. |
| `trove-ffmpeg` | `008333a` → `6e42a79` | **update-available** | 142 commits, 66 files, +14.6k / −1.8k | **Major version 2.5.1 → 3.2.3.** 3.0 requires FFmpeg 6.1+ and Python 3.10+, and changes cut defaults (`1dc2f52`). New: `references/{flags,report,requests,timestamps,workflow}.md`, `scripts/_smartcut.py`, `scripts/_common/alpha.py`. The Trove front (`SKILL.md.tmpl`, `metadata.upstream-version: "2.5.1"`) must be updated by hand. |
| `trove-pulse` | `a218eda` → `4e82b39` | **update-available** | 254 commits, 104 files, +20.4k / −4.6k | Upstream is at v3.32.0. Adds 14 references and new modules including **browser-cookie and CDP access** (`agentcookie.py`, `chrome_cdp.py`, `cookie_paths.py`, `box_chrome_login.py`), `meta_ads.py`, and `x_api.py`; deletes `reddit_rss.py`. Needs a security review before landing. |
| `trove-pulse-cn` | `1a8a04c` → `e0e4141` | **validation-failed** | 35 files, +7.2k / −3.3k | Upstream added a binary file, `scripts/lib/hot_board_cat.png`, which policy rejects (`allow_binary: false`). The fix is to exclude it in the include/exclude selection, not to relax the policy. |
| `trove-test-gap-audit` | `7568a48` → `6afbe78` | no-changes | — | — |
| `trove-docs-sync-audit` | `7568a48` → `6afbe78` | no-changes | — | — |

### 1.3 Adapted skills (manual review, `evidence_sha` bump)

| Skill(s) | Source range | What changed upstream |
|---|---|---|
| 6 × `trove-principle-*` | `cursor/plugins` `397c866..1e9c3f4` | Upstream **condensed** the principles (24 principle files, +132 / −184). For example, `principle-type-system-discipline` dropped its "types are constructions", "don't lie to the compiler", and "strengthen only where partiality appears" sections. Decide per principle whether to follow the condensation or keep Trove's fuller text, then bump `evidence_sha`. New upstream principles worth considering (not in scope here): `test-behavior-not-implementation`, `explain-the-number`, `attack-the-premise`. |
| `trove-web-clip` | `obsidian-skills` `a1dc48e..3ccff53` | One line in `skills/defuddle/SKILL.md`. |
| `trove-beat-sync`, `trove-shot-recipes`, `trove-video-review`, `trove-product-video` | `video-shotcraft` `5ddbf52..3ac67b7` | 14 commits. `e1d15d9` revised the shot library ("keep 150 / drop 66"), so `trove-shot-recipes` may point at removed shots. `1266a3e` moved project SFX sourcing to Freesound. Template opening-hold fix (`30329dc`). Optional social publishing (`e9d9b90`) is out of scope. |

Also check `trove-why`. It is recorded as `origin: original`, but its source
list (Linear, Notion, Slack, Sentry) matches pstack's `why` skill, which changed
heavily in this range (`why/references/sources/*`). If the audit in
[upstream-provenance-audit.md](./upstream-provenance-audit.md) treats it as
inspired-by rather than adapted, leave it alone.

### 1.4 Curated external pins

| Record | Pinned | Remote HEAD |
|---|---|---|
| `curated/sentry.json` (`getsentry/sentry-for-ai`) | `72aadac` | `c198c98` |
| `curated/figma.json` (`figma/mcp-server-guide`) | `131e141` | `9d296d0` |
| `curated/linear.json` | hosted endpoint, no pin | — |

Each pin moves only after the new revision is reviewed against
`external/policy.yaml`: the license allowlist, and no hooks or MCP servers in
the components. `upstream.yaml#external_records` moves with it.

### 1.5 Not tracked, noted only

- `_sample/diagram-design` is being imported as untracked work in
  `skills/design/diagram-design/`. CP1 has to resolve it because it blocks the
  sync gate.
- `_sample/reelbench-skills` is cloned but not in `upstream.yaml` and was not
  requested. Out of scope.

### 1.6 Model references in Trove

The model surface is small. A repo-wide search for model IDs and families,
excluding upstream-owned content, found:

| Location | Current | Issue |
|---|---|---|
| `scripts/eval-runner.ts:42` | `EVAL_MODEL` default `claude-sonnet-5` | Previous generation. The current Sonnet is `claude-sonnet-5-5`. |
| `scripts/eval-runner.ts` call | `thinking: {type: "adaptive"}`, no `output_config.effort`, no `refusal` handling | Sonnet 5.5 recalibrated its effort levels and adds `refusal` stop reasons, which the runner currently misreads as a bad score or a parse failure. |
| `plugins/trove-dev/agents/code-reviewer.md` | `model: sonnet` | The alias resolves to the current Sonnet in Claude Code, so nothing breaks. The open question is whether reviewers should be pinned to a tier or set to `inherit` (§7 D3). |
| `plugins/trove-security/agents/security-reviewer.md` | `model: sonnet` | Same as above. |
| `CHANGELOG.md:104` | history entry for Sonnet 5 | Leave as history; add a new entry. |
| `skills/research/trove-pulse/**` | `"claude opus"` keyword lists, "Opus 4.7" comment, `OPENAI_DEFAULT = "gpt-5.4-nano"` | Upstream-owned bytes. Do not edit; they follow the upstream sync. |
| `_sample/buildloop-video-skills/video-edit/scripts/polish_transcript.py:126` | `model="claude-sonnet-4-6"` | Handled during the BuildLoop adaptation (§3.4). |

API facts that apply here (from the Claude API reference, model table cached
2026-11-03):

- Current IDs: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`,
  `claude-fable-5-2`. Use them exactly as written, with no date suffix.
- `temperature`, `top_p`, and `top_k` return a 400 on every model since
  2026-10-21. The runner already sends none of them; keep it that way.
- `budget_tokens` and `thinking: {type: "disabled"}` return a 400 on Sonnet 5.5,
  Opus 5.5, and Fable 5.2. Keep `adaptive`.
- The Sonnet 5.5 effort default is `high`, with recalibrated levels. Opus 5.5
  and Haiku 5.5 default to `medium`. Always set effort explicitly so a model
  switch never silently changes judge depth.
- Sonnet 5.5, Opus 5.5, and Fable 5.2 can return `stop_reason: "refusal"`. The
  recommended handling is server-side fallbacks (`betas:
  ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) plus an explicit
  `refusal` check before reading content.
- Fable 5.2 guidance: prompts written for earlier models are often too
  prescriptive and lower output quality. Trove's workflow skills are already
  low on all-caps imperatives; a single MUST/ALWAYS/NEVER/CRITICAL count over
  `skills/workflow/*/SKILL.md.tmpl` returned nothing above noise. No blanket
  rewrite is planned. §2.3 sets up the measurement that would justify one.

Host surfaces worth re-verifying in the same pass, since `docs/host-matrix.md`
was last verified 2026-08-28 / 2026-09-09: Claude Code now ships
`claude plugin eval` and a `/skill-doctor` report. Check whether either replaces
or complements `eval:gate` and `validate:claude-manifests` before adopting
anything. Confirm against current docs; do not adopt from memory.

### 1.7 BuildLoop video skills (`_sample/buildloop-video-skills`)

174 files, 12 MB, **not a git repository, no license file**.

| Skill | Lines | What it does | Assessment |
|---|---|---|---|
| `video-cut` | 83 + 3 scripts | Multi-take talking-head cut: word-level transcript plus waveform onset detection; keeps the last good take of each line | **New capability.** Neither `trove-ffmpeg` (`cut.py`, `silence.py`) nor the shotcraft skills do take selection. |
| `broll-ingest` | 73 + 5 scripts + 4 LUTs | Frame map → choose editorial moments → frame-accurate cut → LUT grade → JSON catalog | **New capability** for selection and cataloging. Cutting and grading overlap `trove-ffmpeg` (`cut.py`, `color.py --lut`, `scenes.py`). |
| `video-edit` | **842** + 22 scripts + Remotion project (59 src files) + knowledge docs | Edit pass over pre-cut footage: captions, template overlays, zoom punch-ins, music and SFX score, b-roll. Shorts, Intro, and Longform modes. | **Partly new.** Complements `trove-product-video`, which builds product promos from scratch, and overlaps `trove-ffmpeg` caption, loudness, and music-ducking ops. Body is 342 lines over the 500-line warning. Heavily branded. |
| `oracle-edit` | 83 + 3 refs | Recipe for one creator's "World Cup Oracle" series | **Exclude.** It is personal to one series: hard-coded `/Users/<author>/...` paths, mascot library, and series branding. |

Issues the rewrite has to address (D1 resolved: rewrite as original Trove
skills, license not a concern):

1. **No license or repository.** It cannot be an `adapted` source in
   `upstream.yaml`, which requires a repository. The rewrite makes these
   `origin: original` skills that credit BuildLoop as the inspiration (§3.5).
2. **Binaries and third-party marks.** 35 logos (`apple_inc.png`,
   `mcdonalds.png`, `spotify.png`, `nvidia.png`, …), `subscribe-bug.mp4` (the
   author's branded channel card), the music bed (4.5 MB, licensing per the
   README is unclear), and 8 SFX files. Policy is `allow_binary: false`, and
   trademark logos must not ship regardless of policy.
3. **LUTs are large and would not be bundled.** Each `.cube` is ~970 KB of
   text (33³), four files, ~3.9 MB. The 262144-byte `maximum_file_bytes` limit
   applies only to synced upstream artifacts, and `bun run validate` puts no
   size or binary limit on original skills. `scripts/gen-plugins.ts` copied
   only `references/` and `scripts/` into plugin bundles when this was
   investigated; CP1 added `assets/`, so `assets/luts/` now reaches every
   bundle. D4 keeps them (§3.3).
4. **Unsafe credential handling.** `polish_transcript.py` reads
   `ANTHROPIC_API_KEY` out of `~/Projects/BuildLoop/{ads,automation}/.env` and
   imports from `~/Projects/BuildLoop/automation`. `fetch_stock.py` offers a
   skill-local `.env`. Both must go.
5. **Install-dir writes.** `transcribe.py` creates and self-relaunches into
   `~/.claude/skills/video-edit/.venv`. Trove installs skills as symlinks into
   the checkout or plugin cache, so the venv would be written there. Move all
   state to `~/.cache/trove-media/<skill>/`.
6. **Hardcoded paths.** About 20 `~/.claude/skills/video-edit/...` references
   need `${CLAUDE_SKILL_DIR}`, which hosts already rewrite (Cursor uses
   `[skill-dir]`). Google Drive `Media/` paths need to become a user-supplied
   library root.
7. **Personal branding in rules.** Lime/raisin palette, "Anthropic is the
   channel's house brand", channel-specific Whisper corrections
   (`PHRASE_CORRECTIONS`, "Gemini agent → Hermes Agent"), and the subscribe card.
   These become a per-project `brand.json` and corrections file, defaulting to
   neutral.
8. **Dead or doubtful endpoints.** `source.unsplash.com` direct-download URLs
   (Unsplash retired this service) and Seedance clip references. Check each
   before keeping it.
9. **Dependency licensing.** Remotion 4: copy the license notice that
   `trove-product-video` already states. WhisperX, faster-whisper, opencv, and
   numpy are installed by the user, never vendored.

---

## 2. Model-generation update: design

### 2.1 Eval runner (`scripts/eval-runner.ts`)

- Change the default `EVAL_MODEL` to `claude-sonnet-5-5`. A judge is the
  cheaper second model, so the current-generation Sonnet is the right default.
  The override env var stays.
- Add `EVAL_EFFORT` (default `high`) and send `output_config: { effort }` on
  every call, so a model change cannot silently change judge depth.
- Add refusal handling: send the server-side fallback beta with
  `fallbacks: "default"`, check `stop_reason === "refusal"` before parsing, and
  throw a named error, the same way `max_tokens` is handled today. A refusal
  must never read as a low score.
- Record `response.model` and fallback usage in `usageTotals` so a fallback
  run is visible in the gate output.
- Update the header comment, `MAX_TOKENS` rationale, and the "Sonnet 5 rejects
  …" comment to name the generation they describe.
- Tests: extend the existing eval-runner tests with mocked responses for
  `refusal`, `max_tokens`, and a fallback-served response.

Changing `scripts/eval-runner.ts` matches `globalPattern` in
`scripts/lib/eval-structure.ts`, so the PR runs evals for **every** maintained
skill (65 rubrics). Budget for one full live run.

### 2.2 Re-baselining the gate

A new judge model moves scores. Before merging:

1. Run `bun run eval:gate` with `claude-sonnet-5-5` (new). The old-model run
   (`EVAL_MODEL=claude-sonnet-5`) was dropped on 2026-11-10 (D7), because the
   configured endpoint returns HTTP 403 for that model. Without it a
   pass-to-fail flip cannot be identified, so every failure is investigated as
   a failure in its own right.
2. Record per-skill `weighted_average`, pass/fail, and token totals in
   `dev-doc/model-refresh/2026-11-judge-baseline.tsv`.
3. Any skill that flips pass to fail is investigated: either the rubric or task
   is ambiguous, or the new judge is stricter for a stated reason. Do not lower
   `min_pass_score` to make the gate green.

### 2.3 Skill behavior on new models (measurement only)

The current eval asks the judge to *imagine* a response, so it does not measure
how a skill behaves when Opus 5.5 or Fable 5.2 is actually driving it. This
plan does not try to fix that. It records the gap and leaves one optional,
cheap probe: run the gate with `EVAL_MODEL=claude-opus-5-5` once and diff
against the Sonnet 5.5 baseline. Any prompt-softening of skill prose waits for
a real behavioral eval (candidate: `claude plugin eval`, §1.6).

### 2.4 Agents

Decided (§7 D3): `code-reviewer` keeps `model: sonnet`; `security-reviewer`
moves to `model: opus`. Aliases track the current generation automatically.
Opus 5.5 costs $4/$20 per MTok, cheaper than Opus 5, and missed findings cost
more in security review than in style review.
Check how `gen-plugins.ts` emits agent frontmatter for Cursor, Codex, and
Copilot, and that an alias does not reach a host that needs a full ID.

### 2.5 Docs

- `CHANGELOG.md` entry for the judge move and baseline.
- `docs/host-matrix.md`: re-verify Claude Code fields, including `model`,
  agent fields, and any new plugin-eval surface, and update the verification
  dates for hosts actually re-checked.

---

## 3. BuildLoop integration: design

### 3.1 Approach: rewrite, not adapt (D1)

The three skills are **rewritten as original Trove skills**. The BuildLoop
bundle is a specification of techniques and hard-won lessons, not a source
of bytes. Best practice for the rewrite:

- **Read for behavior, write fresh.** Each skill is authored with
  `trove-write-skill` from a behavior inventory (§3.4): what the skill does,
  its inputs and outputs, and the lessons that justify each rule. No prose is
  copied; rules are restated with their reason.
- **Reuse the engine Trove already ships.** Anything `trove-ffmpeg` does
  (cut, LUT grade, scene and beat detection, loudness, captions burn-in,
  ducking, probe, delivery checks) is called through its documented wrappers,
  not reimplemented. New scripts cover only what is unique: take selection,
  onset-snapped cut points, frame maps, the b-roll catalog, the edit-plan
  linter, and the Remotion composition.
- **Data shape first** (`trove-principle-data-shape`): define the JSON
  contracts before writing logic. That means `words.json`, `takes.json`,
  `catalog.json`, `edit_plan.json`, `brand.json`, and `corrections.json`, each
  with a JSON Schema in `references/`. Every script reads and writes only these
  shapes, so the three skills compose without hidden coupling.
- **Neutral by default.** No creator names, palette, house brand, mascot,
  subscribe card, or channel-specific corrections in the rules. All of that is
  project config (`brand.json`, `corrections.json`) with neutral defaults.
- **Host-portable.** Skill-relative paths through `${CLAUDE_SKILL_DIR}`, state
  in `~/.cache/trove-media/<skill>/`, nothing written to the install directory,
  no `.env` reading, and secrets from the environment only.
- **Progressive disclosure.** Each `SKILL.md.tmpl` body stays well under 500
  lines and holds the workflow, gates, and hard rules. Recipes, template
  catalogs, and mode details live in `references/`.
- **Preview before final.** Every rendering skill keeps a cheap preview loop,
  and a final render only happens after explicit user approval. This lesson is
  kept from the source.

### 3.2 Scope

| Source | Trove skill | Category dir | Decision |
|---|---|---|---|
| `video-cut` | `trove-take-cut` | `skills/media/` | Rewrite (wave A) |
| `broll-ingest` | `trove-broll-ingest` | `skills/media/` | Rewrite (wave A); ships the four LUTs (D4) |
| `video-edit` | `trove-video-edit` | `skills/media/` | Rewrite (wave B) |
| `oracle-edit` | — | — | Exclude (personal series recipe) |

### 3.3 Boundaries (routing)

| Request | Route |
|---|---|
| One operation on a file (trim, transcode, loudness, burn captions, apply a LUT) | `trove-ffmpeg` |
| Raw multi-take recording → keep the best takes | `trove-take-cut` |
| Raw footage → find moments, cut, grade, catalog | `trove-broll-ingest`, calling `trove-ffmpeg` for cut and grade |
| Pre-cut talking-head video → captions, overlays, zooms, score | `trove-video-edit` |
| Product promo built from scratch out of shots | `trove-product-video` |
| QA of a finished video | `trove-video-review` |

Pipeline order to document: `trove-take-cut` → `trove-broll-ingest` →
`trove-video-edit` → `trove-video-review`. Update `docs/routing.md`, the plugin
`routing.md` fragment, `deps.json` `benefitsFrom` (each one benefits from
`trove-ffmpeg`, and `trove-video-edit` also from `trove-beat-sync` and
`trove-video-review`), and make the descriptions disambiguate against
`trove-ffmpeg`'s "edit video and audio" wording.

### 3.4 Behavior inventory (what each rewrite must do)

**`trove-take-cut`**
- Word-level transcript with timestamps; the script text is optional for
  alignment.
- Group repeated readings of the same line; keep the last clean take by
  default and let the user override per line.
- Snap cut points to waveform onsets and offsets, not ASR word boundaries.
  This is the core lesson: ASR timestamps drift and cause clipped consonants
  and clicks.
- Trim dead air and breaths to a configurable gap; short crossfades at joins.
- Output: `takes.json` (decision record) plus the assembled cut through
  `trove-ffmpeg join.py`/`cut.py`, and a verify pass for duration, joins, and
  silence at the edges.

**`trove-broll-ingest`**
- Dense, timestamped frame maps (contact sheets) the agent reads to pick
  editorial moments against a written selection bar
  (`references/selection-rules.md`).
- Shake and motion scoring to reject unusable spans.
- Frame-accurate cut through `trove-ffmpeg`.
- Grade with the bundled LUTs through `trove-ffmpeg color.py --lut`. The skill
  chooses Rec.709 or S-Log3 from the probed transfer characteristics, with a
  soft variant for strength, and the user can override with their own `.cube`.
- Append to a catalog at a user-supplied library root (`--library`), never a
  hardcoded Drive path. The catalog schema is in `references/`.

**`trove-video-edit`**
- Three modes: Shorts (9:16), Intro (16:9, ≤30 s), Longform (16:9,
  chapter-by-chapter).
- `edit_plan.json` drives everything: captions, template overlays, zoom
  punch-ins, b-roll, music bed, and SFX cues. A linter validates the plan
  before any render.
- Transcript correction is an **agent step** (D5): the agent reviews
  `words.json` against the script and `corrections.json` and writes
  corrections. No API key and no second model.
- Remotion composition rewritten from the template catalog (timeline,
  callout, vs-split, stat punch, quote pull, keyword chips, progress steps,
  title card, chapter bar, image card, logo tile). Uses the Remotion license
  notice from `trove-product-video` and aligns its versions.
- Audio score through `trove-ffmpeg` (ducking, loudness). Music and SFX are
  user-supplied directories, with the expected filenames documented. Logos come
  from the user or from a user-run fetch script; none are shipped.
- Stock imagery only through providers whose API is checked at rewrite time.
  `source.unsplash.com` is retired; Pexels uses `PEXELS_API_KEY` from the
  environment. AI-video providers (Seedance) stay optional and out of the
  default path.
- Preview, then contact sheet, then final only on user approval; then hand off
  to `trove-video-review`.

### 3.5 What ships

| Item | Ships? | How |
|---|---|---|
| Rewritten `SKILL.md.tmpl`, `references/`, `scripts/` | Yes | Original Trove content. |
| Four LUTs | **Yes** (D4) | `skills/media/trove-broll-ingest/assets/luts/` with neutral names (`cinematic-rec709.cube`, `cinematic-rec709-soft.cube`, `cinematic-slog3.cube`, `cinematic-slog3-soft.cube`). Kept byte-identical; only the filename changes. See the build note below. |
| Remotion `src/`, `package.json` (pinned versions) | Yes (wave B) | Rewritten. No `node_modules`. |
| Logos, `subscribe-bug.mp4`, music, SFX | No | Third-party marks, personal branded assets, and audio binaries. User-supplied directories instead. |
| `legacy/`, `oracle-edit` | No | Inactive upstream and personal, respectively. |

**Build note for LUTs.** CP1 made `assets/` a support directory
(`scripts/lib/skill-support-dirs.ts`), so `gen-skills.ts` and both copy loops in
`gen-plugins.ts` already carry it to every host output and bundle. CP6 only
places the LUTs under `assets/luts/` and adds a test that they arrive. Fan-out
cost: one
canonical copy plus `plugins/trove-media/{skills,.agents/skills,.copilot/skills}`,
four copies of ~3.9 MB, ~15.5 MB tracked. Add `*.cube -diff` to
`.gitattributes` so reviews don't render 36k-line diffs. Confirm
`verify:generated` and the Copilot install smoke handle the larger bundle.

### 3.6 Attribution

These are original skills, so each row in `upstream.yaml#skills` is
`origin: original`. Credit the source anyway, as a courtesy and a pointer for
maintainers: a line in each `SKILL.md.tmpl` metadata
(`metadata.inspired-by: BuildLoop video skills`) and a `THIRD_PARTY.md` note
that names the LUTs as BuildLoop's grade, shipped by maintainer decision on
2026-11-09.

### 3.7 Tests and evals

- `tests/trove-media.test.ts`: frontmatter, no `~/.claude/skills` paths, no
  `.env` reads, no audio, video, or image binaries, LUT presence and
  byte-identity in every bundle, and a `--help` smoke for each script.
- JSON Schema tests: every script's output validates against its schema.
- `evals/skill-evals/trove-{take-cut,broll-ingest,video-edit}/` with
  `rubric.yaml` and tasks covering routing against `trove-ffmpeg` and
  `trove-product-video`.
- Manual verification on real footage, recorded in
  `dev-doc/media-verification/` (results only, never media binaries).

---

## 4. Throughput checkpoint

1. **Blocking first steps.** (a) Resolve the untracked `diagram-design`
   inventory mismatch; until then `sync:upstream --check` fails in the main
   checkout. (b) CP3's `trove-ffmpeg` 3.x sync, because the BuildLoop rewrites
   call its wrappers and must target the 3.x flags.
2. **Independent workstreams.** Model update (CP2: `scripts/eval-runner.ts`,
   agents, docs), vendored and curated sync (CP3, CP4), and adapted reviews
   (CP5) touch disjoint source files. They can run in parallel worktrees.
3. **Shared mutable state.** `upstream.yaml` (CP3, CP4, CP5, CP6),
   generated outputs (`catalog.json`, `.claude-plugin/marketplace.json`,
   `plugins/*/skills`, `output/**`), `CHANGELOG.md`, and `deps.json`. Each PR
   rebases on `main` and rebuilds generated files with `bun run build`; never
   hand-merge them. Serialize the `upstream.yaml` edits by merging in
   checkpoint order. The `assets/` copy-list change landed in CP1 through
   the shared `SKILL_SUPPORT_DIRS` constant, so no later checkpoint touches
   those copy loops.
4. **Smallest safe decomposition.** Seven checkpoints. Each one is a PR with
   its own static and runtime verification.

## 5. Checkpoints

### CP1: Clean baseline and gates

- **Touches:** `skills/design/diagram-design/` (finish that import with an
  `upstream.yaml` row, or move it to a branch), nothing else.
- **Result:** `sync:upstream --check` runs in the main checkout.
- **Verify:** `bun run sync:upstream -- --check --offline` exits 0;
  `bun run validate`; `git status` shows no untracked skill dirs.
- **Done 2026-11-09 (uncommitted).** Re-imported through `import:skill` as the
  vendored artifact `trove-diagram-design` in `trove-design`, pinned at
  `f2496ac`, with a Trove front, evals, `THIRD_PARTY.md` section, and a
  `not_vendored` row for the example gallery. Scope grew past "nothing else"
  in two places: `assets/` became a canonical support directory
  (`scripts/lib/skill-support-dirs.ts`), and `emitFrontmatter` now quotes
  numeric-looking strings because `upstream-version: "2.6"` was emitted as a
  number and failed the strict-host spec check.
- **Verification:** Build, validation, offline sync, generated-artifact
  freshness, and strict Claude manifest validation passed. `bun test ./tests`
  passed 445 tests with no failures. Bare `bun test` crashes with exit 133
  during discovery; its scope includes ignored upstream sample checkouts.
  All eight vendored Python scripts passed syntax parsing. Automatic approval
  review blocked their runtime smoke test because execution of code from
  `cathrynlavery/diagram-design` needs explicit permission. `eval:changed`
  was not run. The new skill directories remain untracked until the user
  requests staging or committing, so the original clean-status gate remains
  pending. Online `sync:upstream --check` verifies `trove-diagram-design` with
  `no-changes`. The `trove-pulse-cn` binary exclusion landed with CP4, so the
  candidate no longer fails validation on `hot_board_cat.png`.
- **Landed.** Merged as PR #66 (`549bbae`) and released in `v2026.11.10`.

### CP2: Model-generation update

- **Touches:** `scripts/eval-runner.ts`, its tests,
  `plugins/trove-security/agents/security-reviewer.md` (`model: opus`; D3), `CHANGELOG.md`, `docs/host-matrix.md`,
  `dev-doc/model-refresh/2026-11-judge-baseline.tsv`.
- **Result:** The judge runs on `claude-sonnet-5-5` with explicit effort and
  refusal fallback. The baseline comparison is recorded. Agents carry the
  chosen models.
- **Verify:** `bun test`; `bun run eval:gate` live on `claude-sonnet-5-5`
  (§2.2), with every failure investigated; `bun run validate:claude-manifests`;
  `bun run verify:generated`. The two-model comparison was dropped by D7.
- **Implemented 2026-11-10; failures resolved in follow-ups 2026-11-11, full
  gate not rerun.** The new-model baseline is
  complete and its gate is red. The old-model baseline was dropped by D7. The judge defaults to `claude-sonnet-5-5` at
  explicit effort `high`, sends the server-side default refusal fallback, and names
  a refusal or a truncation instead of scoring it. `security-reviewer` uses `opus`.
  `docs/host-matrix.md` records that Copilot does not document Claude's family
  aliases, so no alias rewrite was inferred. Only the new model has
  scores. On 2026-11-10 two `claude-sonnet-5-5` runs at effort `high` covered
  all 227 tasks in 69 suites with no overlap and no gap. 212 passed and 15
  failed. 226 have a score, mean 8.42. The first run recorded 127 tasks across
  38 suites, then the endpoint returned HTTP 429 asking for a wait of 16688
  seconds. A resume at 06:00 EST scored nothing and was told to wait 16106
  seconds. The runner kept the rows instead of dropping them. The second run
  started at 10:31 EST with `EVAL_SKIP_SKILLS` naming the 38 recorded suites
  and scored the other 100 tasks without interruption. 95 passed and 5 failed.
  The skill, rubric, task, judge-prompt, and runner files were hashed before
  the wait and matched when the second run began. All rows are in
  `dev-doc/model-refresh/2026-11-judge-baseline.tsv`, with the raw runs at
  `/tmp/trove-sync/eval/sonnet-5-5.json` and `sonnet-5-5-remaining.json`. In
  the first run nine scored tasks landed under their minimum, in `trove-react-view-transitions`, `trove-design-review` (all three),
  `trove-arena`, `trove-verify` (two) and `trove-react-best-practices` (two). The
  rationales identify task/rubric coverage problems in several failures. The
  React performance tasks receive low scores on unrelated bundle or rendering
  criteria; the arena convergence task is penalized for steps that precede the
  supplied scenario. This is evidence of measurement limitations, not proof
  that every failure is caused by the rubric. The view-transition result also
  questions framework integration, and the design-review results question the
  findings format. The verify tasks lack a concrete artifact; the judge assumes
  a non-git workspace that the task does not establish. Those assumptions and
  possible skill gaps still need controlled verification. All nine failures
  remain failures in the baseline. No threshold, criterion weight, or task was
  changed in that baseline. Later evaluation changes require a separately
  identified run. D7 removes the old-model requirement; D9 authorizes task
  corrections on the new model. `bun run verify:generated` passed on 2026-11-10. The committed
  artifacts match a fresh build and the five generators agree on a dry run.
  The second run added five failures. `trove-perf` task-02 scored 6.7 and
  task-03 scored 4.7, `trove-autoplan` task-03 scored 6.1, `trove-explain`
  task-02 scored 6.7, and `trove-beat-sync` task-02 scored 5.6. The judge
  scores an imagined response. Its rationales say a perf answer has no captured
  baseline or artifact to cite, the explain task declares its code unreal so
  `file:line` citations cannot exist, the autoplan answer rightly declines the
  pipeline for a bug fix and then misses the stage criteria, and the beat-sync
  task covers delivery against a rubric that also weighs beat analysis. Those
  are the judge's readings and have not been confirmed against a real run of
  each skill. The autoplan rationale also notes that the skill has no explicit
  rule for bug-fix input, which may be a real gap. All five remain failures.
  Nine of the ten failing suites have a `SKILL.md` and an eval suite identical
  to `main`. Their failures cannot be attributed to skill or task edits in this
  branch; the model and runner changed, so a model-migration regression remains
  possible without the old-model baseline. The tenth,
  `trove-react-view-transitions`, changed in the CP3 sync. A control run scored
  its three tasks against the body at `HEAD` and against the synced body.
  Task-01 scored 6.4 both times. Both rationales name the same cause, a task
  that asks for Next.js App Router with raw `document.startViewTransition`
  while the skill targets Vite with React Router. The sync did not cause that
  failure. The other two tasks passed on both bodies, at 8.6 and 8.2 before the
  sync and 8.1 and 7.7 after. One call per task cannot separate that difference
  from judge variance. The evidence is `/tmp/trove-sync/eval/vt-pre.json` and
  `vt-post.json`.
  `trove-swift` task-03 returned JSON the runner could not
  parse and has no score. No fallback fired. All 227 calls were served by
  `claude-sonnet-5-5`, using 454 uncached input tokens, 189519 output tokens,
  339750 cache reads and 536627 cache writes across all 227 responses, including
  the Swift response that could not be scored. A one-call probe of the old model,
  `claude-sonnet-5`, returned HTTP 403 from the same endpoint saying an OpenCode
  Go subscription is required, so no old-model score exists and no pass-to-fail
  flip can be judged. No threshold was lowered. `eval:changed` prints "No changed
  skills detected", because this branch has no commits ahead of `origin/main` and
  the detector compares commits, not the working tree.
  Local verification after the resume-reporting fix passed 463 tests with zero
  failures and `bun run validate`. A focused regression first reproduced a
  partial gate returning success, then passed after the fix. `EVAL_SKIP_SKILLS`
  now records `skippedSkills` and makes `--gate` exit 1 even when the selected
  tail passes, because earlier scores have not been verified by that run.
  A further regression reproduced valid JSON failing when the rationale
  contained a closing brace. The unfenced extractor now tracks strings and
  escapes, and all 12 runner tests pass. After that code change,
  `bun run verify:generated`, all 464 tests, and `bun run validate` passed.
  The media script fixes in CP6 and CP7 later added 12 script tests. The
  original Swift response was not
  retained, so this fix does not establish the cause of its parse failure.
  A separate Swift follow-up stopped before its first score with HTTP 429 and
  `retry-after: 16468`; its evidence is
  `/tmp/trove-sync/eval/swift-parser-followup.json`. A second follow-up ran at
  15:31 EST, after the advertised reset, with the Swift skill, its tasks, the
  judge prompt, and the runner hashed before the wait and unchanged at the
  start. All three Swift tasks scored and passed, at 8.5, 7.3, and 8.7, on
  `claude-sonnet-5-5` at effort `high` with no fallback. The evidence is
  `/tmp/trove-sync/eval/swift-after-parser-fix.json`. The result is consistent
  with the parser fix. It does not prove it, because the original response was
  not retained and one call per task cannot rule out a differently formatted
  answer. The run selected one suite, so `--gate` exited 1 by design and it is
  not a gate result. The baseline rows remain unchanged, and task-03 stays
  unscored there. Counting this follow-up, 14 tasks remain under their minimum.
  The original 15 failure
  rationales and criterion scores are retained in
  `dev-doc/model-refresh/2026-11-judge-failures.json`, with hashes identifying
  the two source result files, so investigation does not depend on `/tmp`.
  D7 dropped the two-model comparison on 2026-11-10. Under D8 two skill bodies
  were fixed where the judge's reading matched the text.
  `trove-design-review` now gives every finding a severity of blocker,
  important, or suggestion and a location, with `file:line` or the screen and
  component when no file was supplied, and it names related states to check.
  `trove-autoplan` now declines the pipeline for a bug fix, regression, or
  refactor, routes it to `trove-debug`, `trove-review`, and `trove-commit`, and
  opens with an input-type gate. Rubrics, weights, thresholds, and tasks are
  unchanged. A separately identified run at 20:56 UTC scored those suites and
  `trove-take-cut`, whose body changed in CP6, on `claude-sonnet-5-5` at effort
  `high` with no fallback. Design review scored 7.6, 7.2, and 7.2, up from 6.1,
  5.1, and 6.4. Autoplan scored 8.5, 8.0, and 8.2, up from 6.1 on the bug-fix
  task, and its two other tasks moved from 8.8 and 8.5. Take cut scored 8.8,
  8.8, 10, and 8.5. All ten passed. One call per task cannot separate the small
  moves from judge variance. The evidence is
  `/tmp/trove-sync/eval/d8-rescore.json`, with its hash in the failures JSON.
  The run skipped 66 suites, so it is not a gate result.
  Under D9, the ten task prompts were corrected without changing rubrics,
  weights, or thresholds. Their seven-suite rescore stopped before its first
  response with HTTP 429 and `retry-after: 14528` at 21:27 UTC. Four more
  attempts ran inside that same window, at 22:04, 22:09, 22:11:06, and 22:11:48
  UTC. Their `retry-after` values were 12331, 11947, 11874, and 11892 seconds.
  Notes that dated those attempts on 2026-11-11 were wrong and have been
  corrected. A sixth attempt at 22:46:21 UTC stopped with `retry-after: 9817`.
  A seventh attempt at 00:21:35 UTC on 2026-11-11 stopped with
  `retry-after: 4103`. Zero tasks scored, so no improvement is established.
  The next useful attempt is after about 01:30 UTC. The evidence is
  `dev-doc/model-refresh/2026-11-task-corrections.md` and
  `2026-11-task-corrections-results.json`, SHA-256 `3db1fcae...343bf1`.
  An eighth attempt at 01:31 UTC completed. 22 calls, no fallback. All ten
  corrected tasks passed: view-transitions task-01 8.3 (was 6.4), arena task-03
  8.8 (6.4), verify task-01 9.0 (6.3) and task-02 8.2 (6.2),
  react-best-practices task-01 8.6 (6.0) and task-03 8.8 (6.0), perf task-02
  9.2 (6.7) and task-03 8.6 (4.7), explain task-02 8.6 (6.7), and beat-sync
  task-02 8.2 (5.6). Of the twelve unchanged tasks, only `trove-explain`
  task-03 failed, at 6.4 (was 7.1). Its rationale said it had no code to cite,
  the same gap task-02 had. It now carries a three-file fixture with its
  question, audience, and length unchanged. A `trove-explain`-only rescore at
  02:07 UTC scored 8.3, 8.6, and 8.3, and the task-03 rationale cites the new
  fixture lines. Evidence: `2026-11-task-corrections-rescore.json` (SHA-256
  `f6a6abb0...b906`) and `2026-11-explain-task03-rescore.json` (`3d6d0753...8571`).
  Every task that failed the baseline now passes on its latest text, and no
  rubric, weight, or threshold changed. These are selected-suite follow-ups.
  They do not turn the original full-gate run green, and one call per task
  cannot separate small moves from judge variance. A full `eval:gate` on main
  after merge is the release gate.

### CP3: Low-risk vendored sync plus curated pins

- **Touches:** `trove-react-view-transitions`, `trove-ffmpeg`, including the
  hand-maintained front `SKILL.md.tmpl`: prerequisites for FFmpeg 6.1+ and
  Python 3.10+, the new references, `upstream-version: "3.2.3"`, and the 3.0
  cut defaults. Also `curated/{sentry,figma}.json` and
  `upstream.yaml#external_records`.
- **Result:** Both artifacts report `no-changes`; the curated pins sit at
  reviewed heads.
- **Verify:** `bun run sync:upstream -- --update <id>` for each one (it runs
  build, test, and validate itself and restores on failure); `sync:upstream --check`;
  run `trove-ffmpeg`'s doctor or preflight against a local FFmpeg 6.1+ and record
  the output; for each pin, a written policy check (license, components) in the PR.
- **Done 2026-11-10, partial.** `trove-ffmpeg` updated to `6e42a79` (3.2.3) through
  the updater, which ran build, `bun test ./tests`, and validate. The front now
  requires Python 3.10+ and FFmpeg 6.1+, and `THIRD_PARTY.md` and `CHANGELOG.md`
  record it. `trove-react-view-transitions` moved to `1a2c79d`; its patch was
  rebased because the one-line upstream change sat inside patched context, and the
  skill now says the API is stable in React 19.3. Both report `no-changes` offline,
  and the combined tree builds and validates. The plan-required FFmpeg doctor
  ran on 2026-11-10 and exited 1. It detected FFmpeg/ffprobe 9.0.2 and Python
  3.15.2 but lacks `drawtext`, `subtitles`, `vidstabdetect`, and
  `vidstabtransform`; optional Whisper/Parakeet engines are also absent.
  Evidence is `/tmp/trove-sync/ffmpeg-doctor-current.json`. Caption and
  stabilization paths requiring those filters remain unverified. The shotcraft
  flag cross-check was only done for the scripts those skills name (all six
  still exist). The react lock's `checked_at` is the real commit time,
  `2026-10-27T21:40:02Z`, not a placeholder.
- **Curated pins not moved.** `getsentry/sentry-for-ai` at `c198c98` and
  `figma/mcp-server-guide` at `9d296d0` both declare `mcpServers`, which
  `external/policy.yaml` prohibits. The pins stay at `72aadac` and `131e141`.

### CP4: `trove-pulse` and `trove-pulse-cn`

- **Touches:** `skills/research/trove-pulse*`, their `upstream-patches/`,
  `upstream.yaml` selection: exclude `hot_board_cat.png` from `trove-pulse-cn`,
  and exclude the **new** browser-cookie and CDP modules (`agentcookie.py`,
  `chrome_cdp.py`, `cookie_paths.py`, `box_chrome_login.py`) from `trove-pulse`,
  recorded under `not_vendored` (D2). Any import of an excluded module from a
  vendored module needs a local patch in `upstream-patches/trove-pulse/` that
  turns the lane off cleanly. `chrome_cookies.py`, `safari_cookies.py`, and
  `cookie_extract.py` already ship today, used by `env.py` and
  `setup_wizard.py`; D2 does not cover them. Removing them is a separate
  behavior change, flagged in D2a.
- **Result:** Both report `no-changes`. None of the new cookie or CDP code ships.
- **Verify:** grep the bundles for the excluded module names (zero hits outside
  the patch); `trove-security-review` over the remaining new modules, with
  findings recorded in the PR; `sync:upstream --update trove-pulse` and `--update trove-pulse-cn`;
  `bun test`; one live `trove-pulse` run with recorded output.
- **Done 2026-11-10, with recorded deviations.** Both report `no-changes` offline.
  `trove-pulse` is pinned at `7869eb17`, which is past the plan's `4e82b39` because
  upstream moved again during the work. Three deviations from the literal plan:
  `cookie_paths.py` stays, because `chrome_cookies.py`, `cookie_extract.py`, and
  `safari_cookies.py` import it, so excluding it would break modules D2a keeps;
  the `` `/last30days` `` transform was retargeted. The new spec has no
  slash-command form, but nine references and three scripts still quote the
  invocation, so the rewrite now covers those twelve files and only the
  backtick-quoted form, which leaves repository URLs, config paths, and script
  names untouched; `reddit_rss.py` was removed by hand after the
  updater refused it as an unapproved deletion, and nothing imports it. The new
  `upstream-patches/trove-pulse/local.patch` turns off the extras-host X lane in
  `env.py` and drops the matching wizard instructions.
  `trove-pulse-cn` is pinned at `e0e41410` (4.0.0) with `hot_board_cat.png`
  excluded. Its patch was rebased onto the rewritten frontmatter and now holds only
  Trove's own edits, since the name, heading, preamble, and command rewrites are
  transforms. Its `crawler_bridge.py` keeps a Playwright login the user completes,
  stored under `~/.config/last30days-cn` at mode 0600. It does not read the
  browser's cookie store or attach to a CDP endpoint, so it stays inside D2.
  The live run is recorded. On 2026-11-10, with the judge credentials unset and
  `--no-browser-cookies`, a Hacker News search for Remotion (window 2026-10-11
  to 2026-11-10) exited 0 in 0.9 s and saved two stories. The title-only filter
  hid the fact that both submission bodies name Remotion. A replay after the
  filter checks the body, with credentials unset and browser cookies off, keeps
  four stories: 50086224, 50368804, 50291424, and 50092470. The first three name
  the React tool. 50092470 names a former company called Remotion, so the word
  match is real and the subject is not. A multi-word topic must now match its
  longest word. The engine still scored the run 5 out of 5.
  The static security review is
  `dev-doc/media-verification/2026-11-pulse-security-review.md`. Its medium
  findings are verified in source. `env.py` loads a repository-controlled
  `.claude/last30days-cn.env` without a trust gate. `upstream_bridge.py` can then
  execute both `LAST30DAYS_UPSTREAM_PYTHON` and `LAST30DAYS_UPSTREAM`.
  `import_cookie_header()` persists every cookie pair once one expected login
  name is present. `hot_board.py` reads excluded `hot_board_cat.png`, which is
  absent, so HTML rendering raises `FileNotFoundError`. The excluded browser and
  CDP modules have no canonical or generated files.
  Four medium findings now have regression coverage. A project env file cannot
  grant its own trust. An interpreter override must be an absolute executable.
  Cookie import keeps only the expected login names. Hot-board HTML renders
  without the excluded sprite, and a cross-origin redirect drops Authorization
  and Cookie. Report files are created owner-only. `tests/upstream-sync.test.ts`
  covers the first five, the report writer compiles, and the offline upstream
  lock matches the edited tree. A runtime exercise writes the four report files
  at mode 0600. The same exercise stubs the Grok launcher. A failed or
  inconclusive audit returns before the research command, and only a passing
  audit reaches it.
  Not done: the retained browser-cookie lane. The live search proves body
  matching, not that every retained name collision is about the React tool.

### CP5: Adapted-skill reviews

- **Touches:** 6 × `skills/principles/*`, `skills/documentation/trove-web-clip`,
  4 × shotcraft-derived `skills/media/*`, `upstream.yaml#skills` `evidence_sha`
  values.
- **Result:** Every "review due" row is cleared. Each principle has a recorded
  decision to follow the upstream condensation or keep Trove's text.
  `trove-shot-recipes` no longer points at shots upstream removed.
- **Verify:** `sync:upstream --check` shows no review-due rows; `bun run validate`;
  `bun run eval:changed`; a link check from `trove-shot-recipes` into the
  current shot inventory.
- **Done 2026-11-10.** Decisions, all reviewed at the new heads. Principles: keep
  Trove's text for data-shape, encode-in-structure, laziness, migrate-then-delete,
  and type-discipline. Rewrite only idempotency, which now derives each step from
  observed state. All six evidence pins move to `1e9c3f49`. `trove-web-clip` has no
  behavior change and moves to `3ccff533`. Shotcraft moves to `3ac67b75`. No removed
  card is cited by Trove. New sound effects need a per-file provenance record, CC0
  by default and CC BY only with the credit in the published video, the template
  project's audio is marked as historical material, and `trove-video-review` gains
  an A10 provenance criterion. `upstream_paths` gains `references/sfx-sourcing.md`
  and `template/public/audio/ATTRIBUTION.md`. `trove-why` stays `origin: original`
  with an `inspired-by` credit to Lauren Tan's pstack why skill. `eval:changed`
  reports no changed skills, because this branch has no commits ahead of
  `origin/main` and the detector compares commits. The full gate is the
  measurement. Every task passes for the six principles, `trove-web-clip`,
  `trove-shot-recipes`, `trove-product-video`, `trove-video-review`, and
  `trove-why`. `trove-beat-sync` task-02 fails at 5.6 (see CP2). This branch
  changed that skill's references only. The judge reads `SKILL.md`, which is
  identical to `main`, so the failure does not come from this review.

### CP6: BuildLoop wave A (`trove-take-cut`, `trove-broll-ingest`)

- **Precondition:** CP3 merged.
- **Touches:** `skills/media/trove-take-cut/`, `skills/media/trove-broll-ingest/`
  (including `assets/luts/`),
  `.gitattributes` (`*.cube -diff`), `plugins/trove-media/plugin.yaml`,
  `upstream.yaml#skills` (`origin: original`), `THIRD_PARTY.md`, `deps.json`,
  routing docs, JSON Schemas, `tests/trove-media.test.ts`, evals.
- **Result:** Both skills build for all seven hosts with the four LUTs in every
  bundle, no audio, video, or image binaries, no install-dir writes, no `.env`
  reads, and cutting and grading routed through `trove-ffmpeg`.
- **Verify:** `bun run build && bun run validate && bun test`; LUT
  byte-identity check across bundles; Copilot install smoke;
  `bun run verify:generated`; `bun run eval:changed`; a manual run on a real
  multi-take clip and a real raw b-roll clip, recorded in
  `dev-doc/media-verification/2026-11-buildloop-wave-a.md`.
- **Implemented 2026-11-10; accepted 2026-11-11 on a real recording.** The b-roll
  run is recorded. The take-cut run used a before-and-after demo, not a real
  multi-take recording. Both skills are original rewrites.
  `trove-take-cut` transcribes, records the keeper per line in `takes.json`,
  finds cut points with `scripts/cut_points.py` (an inward waveform scan at a
  fixed threshold), and assembles through `trove-ffmpeg`. `scripts/verify_cut.py`
  fails the cut on a repeated phrase or a late first word.
  `trove-broll-ingest` reads a `look.py` contact sheet, grades from the probed
  transfer, and appends to a catalog at the library root the user names.
  `scripts/shake.py` scores jitter. The four LUTs are byte-identical to the
  source under neutral names, covered by `*.cube -diff`, and a test checks they
  survive into every bundle. `cut_points.py`, `verify_cut.py`, and `catalog.py`
  were run against synthetic inputs. `shake.py` scored 0.00 on a static frame,
  4.86 on a moving test pattern, and 13.88 on a noisy one.
  The Copilot install smoke passed on the installed CLI, 1.0.95: the verifier
  now reads `plugin list --json` when `config.json` is absent and skips the byte
  comparison for a plugin loaded live from the marketplace. The pinned 1.0.69
  job is unchanged.
  The b-roll half of the manual run is recorded in
  `dev-doc/media-verification/2026-11-buildloop-wave-a.md`. Five graded selects
  from `assets/video/greenscreen.mp4`, two shots rejected as repeat coverage,
  and the opening pan re-cut after its first frame landed in a camera move.
  The same record describes a synthetic waveform test using tones and invented
  word labels. It tests boundary scanning and assembly only. The checker ran
  against hand-written JSON, not a transcript derived from the rendered audio.
  The earlier claim that internal pauses prove a checker defect was incorrect;
  the skill explicitly preserves pauses inside kept lines.
  The take-cut scripts ran on recorded speech on 2026-11-10, after D8
  authorized `faster-whisper`. The source was
  `_sample/ffmpeg-skill/site/media/filler_en.mp4`. It turned out to be a
  labelled before-and-after demo of `silence.py --filler` on AI-generated
  footage, not a real multi-take session, so this run does not meet the manual
  check above. The run kept the last copy of each line, cut
  at 6.525 to 8.262 s and 9.746 to 11.363 s, and wrote a 3.375 s file that
  passed `check.py` with 0 failures. Its fresh transcript printed
  `CONTENT: clean (7 words)` after one fix, and the run found two problems. The
  verifier rejected the zero-length range recognizers give a filler, a defect
  in the earlier fix. It now rejects only a backwards range, with a regression
  test. Every reading also holds an "uh" or "um" that the full-file transcript
  dropped, so no clean take exists and the cut keeps a filler in each line.
  The skill now says to keep fillers in the transcript and to transcribe each
  reading alone. The record, with its two departures from the skill, is in the
  wave A note, and the evidence is in
  `dev-doc/media-verification/2026-11-take-cut/`. Both skills pass every eval task on
  `claude-sonnet-5-5`. `trove-take-cut` scored 8.8, 8.7, 9.2, and 8.3.
  `trove-broll-ingest` scored 8.8, 9.2, 9.2, and 8.5. Those scores judge an
  imagined response and do not replace the recorded run on real speech.
  A later review of the scripts found defects that the synthetic runs had not
  exercised. Each was fixed test-first in `tests/trove-media-scripts.test.ts`,
  and each new test failed on the old code. `cut_points.py` collapsed a
  one-sample pulse to a zero-length cut, and it rejected disjoint keepers when
  a line was retaken later in the session than the line after it. It now holds
  the offset open by one sample, rounds the onset down and the offset up, and
  compares keepers in source order. `verify_cut.py` now rejects a word whose
  time range runs backwards. `catalog.py` now refuses an empty field,
  a negative start, or a non-finite span before it touches the file. It also
  refuses a second entry for the same select spelled differently, such as
  `./selects/a.mp4`.
  Under D9, a five-reading synthetic fixture now exercises two false starts.
  Per-take transcription recovered a clean reading omitted by the full-file
  pass. The cut keeps line 1 take 3 and line 2 take 1, rejecting the later
  flubbed reading. Waveform spans 9.617 to 11.513 s and 12.729 to 14.820 s
  produce a 4.000 s output. Its fresh transcript passes `CONTENT: clean (12
  words)`. YouTube delivery measurement reports one failure, -16.2 LUFS just
  below its accepted range, and warnings for 16 kHz audio and no subtitle track.
  The source hash is unchanged. Evidence is in the wave A note and
  `dev-doc/media-verification/2026-11-take-cut-synthetic/`. This covers the
  synthetic workflow.
  **Real recording, 2026-11-11: acceptance met.** The user supplied a 24.18 s
  multi-take recording of their own voice, with one line read twice and a
  false start. The workflow ran end to end. `takes.json` went to the user
  before rendering, and they confirmed the keeper. The first cut passed
  `verify_cut.py` but kept a stray syllable and clipped the "s" of "runs". The
  recording is noise-gated, so the default threshold sat above soft word
  endings. The second cut used a tighter window and `--threshold 0.0015`. Its
  fresh transcript starts on time, holds each line once, and printed
  `CONTENT: clean (32 words)`. The skill now documents the quiet-recording
  threshold. The aspect and loudness failures from `check.py` belong to the
  source. Evidence is in the wave A note and
  `dev-doc/media-verification/2026-11-take-cut-real/`.

### CP7: BuildLoop wave B (`trove-video-edit`)

- **Precondition:** CP6 merged.
- **Touches:** `skills/media/trove-video-edit/` (references, scripts,
  rewritten Remotion project), `brand.json` and `corrections.json` schemas, plugin manifest,
  routing, tests, evals, `README.md` media section.
- **Result:** A pre-cut talking-head clip renders a preview and a final through
  the skill, with user-supplied music, SFX, and logos, and neutral brand defaults.
- **Verify:** `bun run build && bun run validate && bun test`; body under 500
  lines (validator warning count unchanged); `bun run eval:changed`; a manual
  preview and final render on a Shorts clip and an Intro clip, measured with
  `trove-ffmpeg check.py` and reviewed with `trove-video-review`, recorded in
  `dev-doc/media-verification/2026-11-buildloop-wave-b.md`.
- **Implemented 2026-11-10; accepted 2026-11-11 under D10.** `trove-video-edit` is an original
  rewrite. One `edit_plan.json` drives the edit, `scripts/lint_plan.py` rejects a
  plan with a backwards range, an overlap, a blank beat, a missing asset, or a
  beat past the probed duration, and the final render waits for approval of a
  preview. The Remotion composition lives in `assets/remotion/` so the build
  ships it, and it is pinned to `4.0.542`. It resolves `plan.source` through
  `staticFile`, because a bare path 404s in the renderer, and it renders the
  speaker under the overlays so a zoom never crops one. Music, sound effects,
  and images are user-supplied. The body is 98 lines.
  The source's channel-specific rules (brand terms, subscribe card, caption
  styling, per-template timing) were not carried over. They describe one
  creator's house style, and the plan calls for neutral defaults.
  Rendered 2026-11-10, on generated footage: a preview and a final for an Intro
  clip and a Shorts clip, measured in
  `dev-doc/media-verification/2026-11-buildloop-wave-b.md`. The render only
  completes when Chrome Headless Shell runs from an internal disk. On the
  external APFS volume this checkout sits on, the same binary never finishes
  loading the root component. The cause is the volume, and the record says so.
  The same record now includes the review. It is not a certification.
  `trove-video-review` refuses to certify a video from the context that
  produced it. The measured rows are the content checks, the title at frame 60
  only, the zoom from 190 px to 202 px, and loudness at -21.8 LUFS with a true
  peak of -20.7 dBTP. Criteria that need a brief, a storyboard, a data policy,
  or a second export stay unchecked.
  The earlier claim that no real footage was available was wrong.
  `assets/video/greenscreen.mp4` rendered as a 1,470-frame preview at scale
  0.25, but its 49-second duration exceeds the 30-second Intro limit, its
  anchors were test labels, and no approval or final exists. An image-only beat
  was also found to render nothing. The fix uses Remotion `Img` and
  `staticFile`. Frame 15 changed from 0 magenta pixels to 107,184 pixels, rows
  695 to 925, and `tsc --noEmit` exits 0. A separate review of the three existing
  files is recorded in the wave B note. It requires corrections and certifies
  nothing.
  `trove-video-edit` passes every eval task on `claude-sonnet-5-5`, at 8.9,
  8.8, 9.2, and 8.5.
  The same script review led to test-first fixes in `lint_plan.py`. It now
  rejects a plan with no bare source filename, an unknown beat kind, a caption
  with no text, a beat that starts before the source, or a non-finite time. The
  overlap check now compares rendered frames instead of seconds, because two
  beats that only touch in seconds can land on the same frame. The frame rate
  comes from `--fps` (default 30, matching the composition), since the plan
  schema has no frame rate field. The Remotion project names `zod` as a direct
  dependency, because `Edit.tsx` imports it.
  Previews on talking-head footage rendered on 2026-11-10 from
  `ai_talk_en.mp4`, AI-generated footage of one speaker. The Intro preview is
  the clip as it is, and the Shorts preview is a `fit.py` centre crop to 9:16.
  Each has three caption beats from a fresh word-level transcript, linted
  sound at 24 fps. Both passed `check.py --content` with 0 failures, and
  caption pixels appear only inside their beats. The record is in the wave B
  note.
  The user approved both previews on 2026-11-10. Both finals rendered at full
  size, 1920x1080 and 1080x1920, with 361 frames each. Both passed 18 delivery
  checks with 0 failures and 3 warnings. Loudness measured -13.0 and -13.1 LUFS,
  with true peaks -3.0 and -3.2 dBTP. Caption placement was inspected in both
  formats. The independent review is recorded in the wave B note. It does not
  certify either final. It requires timing reconciliation, colour correction,
  an intentional silent-ending decision, and a higher Shorts caption. A later
  probe proves `--color-space bt709` writes limited-range BT.709 tags, and a
  corrected still places the portrait caption above row 1574. Corrected
  full-size renders now exist beside the approved finals. They are limited-range
  BT.709, pass delivery with only the optional subtitle warning, and place the
  portrait caption on rows 1328 to 1533. A fresh independent review finds no
  required correction in the measured criteria. It does not certify the files
  because brief, storyboard, brand, music, effects, and data-policy inputs were
  not supplied. Under D10 the user accepted CP7 on that measured review.

## 6. Risks

| Risk | Mitigation |
|---|---|
| The rewrite loses a lesson the source learned the hard way | The §3.4 behavior inventory is the acceptance list; CP6 and CP7 manual runs check each item on real footage. |
| ~15.5 MB of LUT copies in the repo | Accepted by D4. `*.cube -diff` keeps reviews readable; revisit with Git LFS if more assets arrive. |
| The rewrite is large (CP7 especially: 22 scripts and a 59-file Remotion project in the source) | Reuse `trove-ffmpeg` for everything it covers; CP7 may split into a composition PR and a plan, linter, and score PR if the diff passes ~2k lines. |
| The `trove-ffmpeg` 3.x defaults change behavior that `trove-product-video` and `trove-beat-sync` rely on | CP3 greps every `trove-ffmpeg` flag those skills cite and checks it against 3.2.3 `references/scripts.md`. |
| The new judge flips many skills to fail | §2.2 baseline. Investigate per skill; never lower thresholds to make the gate pass. |
| Full eval run cost (65 skills × 2 models) | Run once per model in CP2 and use `eval:changed` afterwards. Record token totals. |
| Excluding cookie modules breaks upstream imports | CP4 local patch disables those lanes; `sync:upstream --update` fails closed if the patch stops applying. |
| Generated-file conflicts across parallel PRs | Rebuild on rebase and run `verify:generated`; never hand-merge. |

## 7. Decisions (resolved 2026-11-09)

| # | Question | Decision |
|---|---|---|
| D1 | BuildLoop license and provenance | Rewrite as original Trove skills using best practice (§3.1); license is not a concern. Credit BuildLoop as the inspiration (§3.6). |
| D2 | `trove-pulse` new browser-cookie and CDP modules | Exclude through selection; record in `not_vendored`. |
| D2a | The three cookie modules that already ship (`chrome_cookies.py`, `safari_cookies.py`, `cookie_extract.py`) | **Keep as-is** (decided 2026-11-10). Removing them would change current `trove-pulse` behavior. They stay opt-in and off by default. |
| D3 | Agent models | `code-reviewer` keeps `sonnet`; `security-reviewer` moves to `opus`. |
| D4 | LUTs | Keep all four, byte-identical, under `trove-broll-ingest/assets/luts/`; build copies `assets/` into bundles. |
| D5 | Transcript polish | Agent step; no script, no API key. |
| D6 | Skill names | `trove-take-cut`, `trove-broll-ingest`, `trove-video-edit`. |
| D7 | Old-model baseline (decided 2026-11-10) | Dropped. `claude-sonnet-5` returns HTTP 403 from the configured endpoint, and no endpoint or credential is switched to reach it. CP2 is verified on `claude-sonnet-5-5` alone. |
| D8 | Red gate and the CP6 transcriber (decided 2026-11-10) | Fix the two failures that point at real skill gaps, `trove-design-review` severity levels and the `trove-autoplan` bug-fix rule, and rescore those suites on a separately identified run. Thresholds, weights, and tasks stay unchanged for this run. For CP6, install `faster-whisper` in a disposable environment outside the repository. |
| D10 | Closing CP6 and CP7 (decided 2026-11-11) | CP6: the user supplied a real multi-take recording, and the take cut ran on it. CP7: accepted on the independent measured review of the corrected finals. Brief, storyboard, brand, music, effects, and data-policy criteria stay recorded as unchecked, because a test clip has none. Commit the work, push the branch, and open a PR. |
| D9 | Remaining acceptance work (decided 2026-11-10) | The user approved both CP7 talking-head previews as-is. Render and measure their finals. For CP6 use synthetic retakes, recording the real-recording clause as partially met. For CP2 correct contradictory or underspecified tasks and rescore the affected suites separately, preserving all thresholds, criterion weights, and original baseline rows. |

## 8. Decision gate: plan readiness

Context: execution should start only when every checkpoint can be verified on
its own.
Question: is this plan concrete enough to execute one checkpoint at a time?
Options: A. Yes, execute CP1, then CP2 to CP5 in parallel worktrees, then CP6
and CP7. B. Revise the plan. C. Stop for missing information.
Default: A. D2a was decided on 2026-11-10, keep as-is.
