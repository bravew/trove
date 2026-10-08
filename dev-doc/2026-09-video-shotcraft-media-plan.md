# trove-media: cinematic product video skills from video-shotcraft

**Status:** Revised 2026-10-04. Wave 2 of `trove-media`, starting after
`trove-ffmpeg` ships (CP5 of
[2026-10-trove-media-ffmpeg-plan.md](./2026-10-trove-media-ffmpeg-plan.md)).

This plan was first written on 2026-09-14 against
`5e71af35a2daee492dd3ea93e5e8903f32dcd13c` (2026-09-09). On 2026-10-04 it was
re-reviewed against `_sample/video-shotcraft` at
`5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab` (2026-09-28, `feat(workbench): add
Russian (Русский) interface language on top of #86 i18n (#88)`). That checkout
is a clone of `https://github.com/Vincentwei1021/video-shotcraft.git`, and
`git ls-remote` confirmed it was the remote head that day. The source declares
plugin version `1.0.0` and is licensed Apache-2.0,
`Copyright 2026 Wei Yihao`. `_sample/` is gitignored, so the checkout is
evidence only and never ships.

The plugin namespace `trove-media` and the source category `skills/media/` are
created by the ffmpeg plan. This plan adds four skills to them and does not
create the plugin.

## Delivery workflow (approved 2026-10-04)

This plan is [Epic #14](https://github.com/bravew/trove/issues/14), with
sub-issues #28–#34. Implement epics in order: #12, then #13, then #14. Wait until
Epic #13's final PR merges into `main`, then create `epic/media-wave2` from the
updated `origin/main`.

Each sub-issue has a branch and worktree based on `epic/media-wave2` and one PR
into that branch. Independent skill issues #29–#32 may run in parallel after
#28. Worktrees go outside the repository at `../trove.wt/<branch>`. The manual
smoke issue #34 gets a PR recording measured results in
`dev-doc/media-verification/issue-34.md`.

Close sub-issues after their PRs merge into the epic branch. When all sub-issues
are implemented and merged, run the combined verification contract and create
one final PR from `epic/media-wave2` to `main` with `Closes #14`. The shared merge
and CI rules are in the ffmpeg plan's "Delivery workflow" section.

## Upstream changes since the first review

Phase 1 (#28) re-ran the inspect on 2026-10-07 and the remote head is still
`5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab`, the revision this section reviewed.
No diff is owed. The table below is the comparison to the original `5e71af3`.

`5e71af3..5ddbf52` contains four commits and touches 58 files (+2,582 / −280):

| Commit | Area | Effect on this plan |
| --- | --- | --- |
| `a1ec677` (#80) | `template/themes/**`, `template/src/themes/**`, `template/THEMES.md`, `workbench/**` | The template now has nine film themes (Ink Press, Modern Light, Midnight, Sage, Coral, Iris, Deep Ocean, Obsidian Violet, Vintage Kraft) plus palette editing. The theme is selected at render time through `--props` (`{"theme": "<id>", "colors": {…}}`). The template branch of `trove-product-video` gains one choice: the theme. Everything else stays in the user's checkout. |
| `e2d8928` (#86), `5ddbf52` (#88) | `workbench/**`, one line of `references/workbench.md` | The workbench UI now defaults to English, with Chinese and Russian available. That removes a language barrier, but not the reason the workbench is deferred: Trove has no delivery surface for a local Vite app. |
| `a1d9c8f` (#91) | `README.md` | Adds more Showcase promotion. This is still excluded (see "Author promotion is removed"). |

`SKILL.md`, the eight adapted references, `template/TEMPLATE.md`, and all 157
cards are byte-identical between the two revisions (`git diff --quiet` on those
paths). `template/THEMES.md` is new in #80, so it is not part of that identity
claim. The skill selection and the corrections below therefore stand. Only the
evidence revision moves.

The first review also missed one file: `references/sequences/promo-energy-arc.md`
(50 lines). It is present at both revisions and holds the default four-segment
energy curve for a 30–60 s promo. It is now an input to `trove-product-video`.

Nearly all upstream churn lands in `workbench/`, `template/`, and `README.md`.
None of those are adapted. Drift tracking for this source must therefore key on
the adapted files, not on the repository head (see Phase 5).

## What the source is

One large self-contained production library, 242 MB on disk including `.git`
(sizes below measured at `5ddbf52`):

| Part | Size | Contents |
| --- | --- | --- |
| `references/` | 948 KB | 8 methodology documents + `sequences/promo-energy-arc.md` + 157 shot recipe cards under `references/shots/<category>/` (8,065 lines) |
| `assets/` | 36 MB | 7 Remotion components + helpers (60 KB), capture scripts, brand files, and 149 SFX + 5 BGM tracks as mp3 |
| `demos/` | 5.1 MB | 221 reference TSX implementations (1.9 MB) plus 3.3 MB of real-page PNG textures |
| `template/` | 8.0 MB | "Ink Press", a complete renderable 36.2 s / 1920×1080 / 30 fps promo project, now with nine selectable film themes (`template/THEMES.md`) |
| `gallery/` | 2.3 MB | Static site and `api/library.json` indexing 157 cards / 214 styles; preview mp4s live in a GitHub release, not in git |
| `workbench/` | 1.8 MB | Local Vite + Remotion multi-track editor opened after delivery; English UI by default since #86 |
| `jianying-export/` | 44 KB | CapCut/剪映 draft export (`mac_draft.py` verified, `windows_draft.py` unverified) |

`SKILL.md` and every reference are written in Chinese. The authored capability
is a six/eight-stage workflow with three mutually exclusive modes (use the
template, autonomous free creation, co-creation), a shot-card vocabulary bound
to exact demo source, beat-synced timelines, sound design against the bundled
SFX library, deterministic rendering rules, and an independent final review run
by a clean-context subagent.

## What Trove can and cannot carry

Trove's skill contract allows exactly two support directories, `references/`
and `scripts/` (`scripts/gen-skills.ts:63`, `scripts/gen-plugins.ts:581`).
`upstream.yaml` policy sets `maximum_file_bytes: 262144`,
`maximum_artifact_bytes: 4194304`, and `allow_binary: false`. Skill bodies are
capped at 500 lines and ~5,000 tokens as errors (`scripts/lib/skill-budget.ts`).

So the audio library, page textures, preview mp4s, the template project, the
demos tree, and the workbench app cannot be vendored — not as a stylistic
choice but because each violates a stated policy or has no destination
directory. The 157 cards could physically fit, but translating and maintaining
8,065 lines of recipe text that upstream regenerates from `gallery/
sync-from-cards.py` would fork a living catalog Trove cannot keep current.

**Design consequence: Trove ships the methodology and the protocol for using
the upstream library, not a copy of the library.** The public gallery API makes
this workable — `https://vincentwei1021.github.io/video-shotcraft/api/library.json`
returns 200 with all 157 cards and 214 style keys, and `llms.txt` is served
alongside it. Card text and demo TSX are read from the user's own checkout when
one is present.

## Selection

Four skills in `plugins/trove-media`, canonical sources under `skills/media/`:

| Skill | Adapted from | What it owns |
| --- | --- | --- |
| `trove-product-video` | `SKILL.md`, `references/pipeline.md`, `references/guided-free-creation.md`, `references/sequences/promo-energy-arc.md`, `template/TEMPLATE.md`, `template/THEMES.md` (render-time theme props only) | Mode selection after a minimal read-only product inspection; stages 0–7; the default energy arc; real-screenshot rule; design-token extraction; deterministic render rules; delivery handoff to `trove-ffmpeg` |
| `trove-shot-recipes` | `references/shots/**` frontmatter, `references/aesthetic-rules.md`, `gallery/` resolution rules | Resolving a card name against the library index, reading the card and its exact reference implementation before writing motion, and the aesthetic constraints that hold without assets |
| `trove-beat-sync` | `references/music-beat-sync.md`, `references/sound-design.md` | BPM/phase grid fitting and transient validation before storyboarding, `beatF(n)` timelines, the ≤3 full-frame impact budget, post-render cut-error verification, output-offset compensation, dual BGM / no-BGM delivery rendered from one timeline through Remotion props |
| `trove-video-review` | `references/final-review.md`, `references/aesthetic-rules.md` | Independent clean-context final review producing a frame-numbered report across plan consistency, feature coverage, shot fidelity, technical quality, and data safety |

`trove-video-review` is split out rather than folded into the pipeline for the
same reason the source insists on a subagent: the producer cannot be the first
reviewer. Splitting it makes that a separately invocable skill instead of an
instruction the producing context can quietly skip, and it matches the shape of
`trove-test-gap-audit` and `trove-docs-sync-audit`.

Deferred from this version: the workbench editor (upstream-specific app, no
delivery surface in Trove), CapCut/剪映 export (needs `pyJianYingDraft`, a venv,
and has one unverified platform path), and the Ink Press template replacement
walkthrough as a standalone skill — the template route stays a branch inside
`trove-product-video` that points at the user's checkout.

## Per-document adaptation map

Written in Phase 1 (#28) before any skill body is authored. Each adapted
document is classified as **port** (asset-independent prose or protocol),
**trove-ffmpeg** (a step that becomes a script call), or **drop**
(upstream-infrastructure-only). Line counts are from `5ddbf52`.

| Document | Ports | Becomes `trove-ffmpeg` | Dropped |
| --- | --- | --- | --- |
| `SKILL.md` (266) | The three-mode decision, the minimal read-only product check, the nine core principles, the file-routing table, mode boundaries | Beat analysis → `scenes.py --beats`; rendered-frame review → `look.py` / `check.py` | Remotion internals, the workbench app, jianying export, author promotion, gallery URLs and `fetch-media.sh`, the asset inventory |
| `references/pipeline.md` (402) | Stage order and gates, brief and decision table, styleframe and brand-to-easing presets, feature-to-shot mapping, energy-arc storyboard with hold budgets, the capture three-piece, per-shot discipline, sound-after-lock, independent review, dual-BGM delivery, pitfalls | Reference contact sheets → `look.py --tiles`; frame review → `look.py --at`; audio extract → `audio.py` / `check.py`; loudness → `loudness.py` | Remotion scaffolding, workbench parity, the template route, gallery and `library.json` resolution, `capture-template.mjs` |
| `references/guided-free-creation.md` (200) | Brief table and fill rules, decision table, two-round visual-direction confirmation, feature-to-shot mapping, card-name and style-key resolution, storyboard confirmation, defaults and skip rules, reply format | none | Gallery URLs, `library.json` and demo TSX resolution, Remotion specifics |
| `references/sequences/promo-energy-arc.md` (51) | The segment table, breathing-card rules, fill-in flow, pitfalls, transition styles | none | The template reference implementation |
| `template/TEMPLATE.md` (100) | The swap discipline and the quality checklist | Frame back-review → `look.py` | The template project as a whole |
| `template/THEMES.md` (45) | none | none | The whole document (workbench palette UI) |
| `references/aesthetic-rules.md` (188) | Rules R1–R4, Q1–Q11, S1–S5, C1–C3, P1–P4 as prose | S5 offset correlation and `max_volume` → `loudness.py`; Q2 and P1 pixel tools → `look.py` / `check.py` | Template refs, Mixkit files, Remotion implementation notes |
| `references/music-beat-sync.md` (258) | The whole methodology: grid fitting, half and double checks, three-class drum mapping, hit table, anchor binding, two-error reporting, offset diagnosis | Grid fit, drum classification, acceptance metrics, stem separation, cross-check, and the post-render re-test → `scenes.py --beats` and `check.py` | Remotion TS constants, inline `uv` / `python` commands, the `analysis/` directory |
| `references/sound-design.md` (358) | Sound ordering, BGM-first skeleton, genre vocabulary, category table, relative pinning, duration rule, volume semantics, anti-machine-gun rules, riser cadence, the offset formula | `volumedetect` and `loudnorm` → `loudness.py`; extract and correlation → `audio.py` / `check.py`; durations → `check.py` | The asset inventory, Mixkit URLs, Remotion gain behavior |
| `references/final-review.md` (117) | The whole review checklist and the frame-numbered report format | Beat-error re-test → `scenes.py --beats`; clip check → `loudness.py`; offset check → `check.py`; sharpness → `look.py` | Review inputs that do not ship |
| `references/jianying-export.md` (184) | The editable-versus-baked layering principle only | none | `pyJianYingDraft`, the draft formats, the venv, CapCut specifics |
| `references/workbench.md` (158) | The future-editable authoring discipline only | none | The workbench app |
| `references/shots/**` (157 cards, 10 categories) | Card frontmatter shape (name, one-line, use, duration, energy, tags) and the body sections (intent, motion core, parameter table, pitfalls, reference implementation), plus the resolution protocol | none | Card bodies and the `demos/**` TSX are read from the user's checkout, never vendored |

Cards carry no code. The runnable Remotion implementation lives in `demos/**`
(221 TSX files), so `trove-shot-recipes` points at the user's checkout for card
bodies and implementations rather than shipping either.

## Inspect findings (Phase 1, 2026-10-07)

`import:skill --inspect` against `5ddbf52` reported 172 selected files, 768,492
bytes, zero hard rejects, and six flags. Each is resolved here.

| Flag | Resolution |
| --- | --- |
| `SKILL.md:263` network use | The line is upstream's own gallery URL and `gallery/fetch-media.sh`. The adapted skills reference the public gallery API and `llms.txt` as documentation only and read card text from the user's checkout. No runtime fetch is authored. |
| `references/guided-free-creation.md:138` network use | The same gallery fetch. Resolved the same way. |
| `references/workbench.md:120` network use | The workbench document is dropped whole, so the flag is moot. |
| `references/shots/typography/lead-word-zoom-assemble.md:34` `{{` | The characters are inside card prose about a Remotion `style={{…}}` snippet. Cards are never resolved by Trove's template engine, so nothing collides. `trove-shot-recipes` reads card text as data at runtime. |
| `template/TEMPLATE.md:1` support directory | The template project is dropped. The template route points at the user's checkout. |
| `.github/ISSUE_TEMPLATE/showcase.yml:1` `.github/` present | Excluded by default and dropped by the author-promotion decision. |

## Boundaries against existing skills

These four skills cover product-video direction, shot vocabulary, rhythm, and
review. They do not restate generic Remotion API usage or HTML-composition video
authoring. Hosts commonly have separate skills for those, and duplicating them
would create conflicting guidance. Executing an edit, transcode, loudness pass,
or delivery check defers to `trove-ffmpeg`, which ships first in the same
plugin (see [2026-10-trove-media-ffmpeg-plan.md](./2026-10-trove-media-ffmpeg-plan.md)).
`trove-product-video`, `trove-beat-sync`, and `trove-video-review` declare
`benefits-from: [trove-ffmpeg]`. Each skill states its boundary in one line and
defers. The next section gives the exact split.

## Working with `trove-ffmpeg`

The upstream source calls raw `ffmpeg` in about a dozen places
(`SKILL.md:150`, `pipeline.md:74,227,347`, `music-beat-sync.md:174,212`,
`sound-design.md:232–247,320`, `TEMPLATE.md:80`). `trove-ffmpeg`'s own rule is
that no raw `ffmpeg`/`ffprobe` runs outside its scripts. It covers most of
these steps with measured, verified output. The adapted skills call its scripts
instead of copying the raw commands. When `trove-ffmpeg` is not installed, they
name the step that is unavailable and do not improvise a command.

| Shotcraft step | Upstream does | Adapted skill does | Notes |
| --- | --- | --- | --- |
| Reference-film motion breakdown (stage 2) | `select=eq(n,…)` + `tile=4x5` contact sheet | `look.py REF --tiles 4x5` for an overview, then `look.py REF --at hh:mm:ss:ff …` per moment | Four-part SMPTE time is exact to the frame at the source rate (`scripts.md` "Time grammar") |
| Key-frame review after each full render (stages 5–7) | `ffmpeg -vf select=eq(n,…)` | `look.py out/promo.mp4 --at hh:mm:ss:ff …` for the 2 acceptance frames per shot | `npx remotion still` remains the per-shot check before a full render. That is Remotion's job, not ffmpeg's |
| Clipping check after gain > 1 | `-af volumedetect`, read `max_volume` | `loudness.py out/promo.mp4 --measure-only --json`, read true peak | True peak is stricter than sample peak, so the check only gets safer |
| Recording a new SFX's peak | `volumedetect` | `scenes.py sfx.mp3 --audio-peaks --json` | |
| Pre-normalising a quiet SFX | `loudnorm=I=-16:TP=-1.5` | `loudness.py in.mp3 -I -16 --tp -1.5 -o out.mp3` | Writes a new file. Never overwrites the library copy |
| Extracting render audio for re-testing | `ffmpeg -vn -acodec pcm_s16le` | `audio.py out/promo.mp4 -o /tmp/render-audio.wav` | |
| Beat grid, first pass | `uv run --with librosa --with scipy` | `scenes.py bgm.mp3 --beats --json` (BPM, phase, supported onsets, 0.5×/2× checked, `usable`) | Same acceptance gate either way. See "Beat analysis" below |
| Post-render cut-error re-test | Re-run grid fitting on the extracted audio | `scenes.py <final file> --beats --json`, then compare design frames with measured beats | Run it on the **delivered** file. See the delivery order below |
| Output audio offset (sound-design §4.6) | numpy `np.correlate` of SFX probes against render audio | Unchanged: numpy cross-correlation on the `audio.py` WAV | `sync.py` does not fit: it ignores lags with under 35 % overlap, so a 0.5 s probe against a 70 s track is outside its design |
| Platform check | Not in upstream | `check.py <final file> --platform <dest> --content` | New: black, frozen, and silent spans plus spec rows feed review item Q and A6 |

**What stays out of `trove-ffmpeg`:**

- **The no-BGM version.** Upstream renders it from the same timeline with
  `props-nobgm.json` (`{"bgm": false}`), and explicitly says *not* to strip the
  track with ffmpeg (`pipeline.md:353`). Review item A8 checks that the two
  versions match frame for frame. Mixing in ffmpeg would break that.
- **Reframing a finished promo.** `export.py --fit crop` or `fit.py` to 9:16
  would cut into a composed 16:9 layout. A vertical deliverable is a
  re-composition in Remotion, which is a decision for `trove-product-video`.
  Padding (letterboxing) is mechanical, and is offered only when the user asks
  for it.
- **Captions.** Promo text is drawn in the picture by Remotion. `caption.py`
  is not part of this pipeline.

**Delivery order.** These are the stage 7 rules, owned by `trove-product-video`
and checked by `trove-video-review`:

1. Render both versions with Remotion.
2. Normalise the **BGM version** with `loudness.py -I <dest LUFS> --tp <dest
   TP>` for the named destination. Video is stream-copied, but the audio is
   re-encoded. A re-encode changes the encoder priming that sound-design §4.6
   measures as the output offset.
3. Therefore run the cut-error re-test and the offset probes on the normalised
   file, not on the Remotion output. Record the encoder and bitrate from
   `loudness.py --json` with the offset, as §4.6 asks for each pipeline.
4. The **no-BGM version** is a stem for the user's own music, so it is not
   normalised to a platform target. Its true peak is measured and reported
   only.
5. Run `check.py --platform <dest> --content` on every delivered file, and
   report PASS/WARN/FAIL as measured.

**Beat analysis.** Upstream fits the grid with librosa through `uv run --with
librosa --with scipy --python 3.11`. That fetches packages at runtime, which
Trove skills do not do silently. `scenes.py --beats` is standard-library-only
and reports what the gate needs: tempo, phase, the beat list, and which beats
are supported by onsets. Its method differs from upstream's (RMS-flux
autocorrelation at a 10 ms step, against least-squares fitting over
`beat_track`). Nobody has shown that it meets upstream's stated accuracy (mean
<5 ms; all within ±33 ms; 90 % within ±15 ms). So:

- `trove-beat-sync` runs `scenes.py --beats` first. It then applies upstream's
  acceptance gate (match ≥98 % and the residual limits) to the result,
  unchanged.
- If the gate fails, or `usable` is false, the skill asks before running the
  librosa path. It names what `uv run --with` will download. Without consent, it
  reports that the track cannot be beat-synced to the stated tolerance and
  falls back to content pacing, as upstream does when there is no music yet.
- Phase 2 measures the two methods side by side before any of this is
  committed as guidance. If `scenes.py --beats` misses the gate on strong-beat
  tracks, the order flips: librosa with consent first, `scenes.py` as the
  report-only fallback.

## Corrections and adaptations to make

- **Language.** Every artifact is authored in English. Names, descriptions,
  triggers, and bodies follow Trove's naming and budget rules. The Chinese
  source stays the provenance anchor, not a bundled translation.
- **Dependency honesty.** The source assumes its own repository is the working
  directory. The adapted skills must establish where the library is
  (user-supplied path, an installed `video-shotcraft` skill directory, or an
  explicit clone the user authorizes) and state plainly what is unavailable
  without it. No silent `git clone`, `npm install`, `pip install`,
  `uv run --with …`, or headless browser download. The first review missed
  `uv run --with librosa --with scipy` (`music-beat-sync.md:31,248`). It fetches
  packages on first use and so needs the same consent as an install. numpy for
  offset probes is the same case. Template theme changes that need
  `build-palette-assets.cjs` require Playwright. That is an upstream development
  step, and the skill does not run it: theme selection through `--props` needs
  no extra tool.
- **Degraded mode is defined, not implied.** Without the library: direction,
  pacing, beat-sync method, deterministic-render rules, and review remain
  usable; named shot cards, reference TSX, the SFX catalog, and the template do
  not. The skill says so instead of inventing a card from its name — which the
  source itself calls out as discarding all tuning. A second axis is
  independent of the first: without `trove-ffmpeg` (or without `ffmpeg` on
  `PATH`), rendering still works because Remotion bundles its own. Frame
  review, peak checks, loudness, the cut-error re-test, and platform checks do
  not work, and the skill lists them as unchecked in the delivery report rather
  than passing them.
- **Author promotion is removed.** The source's delivery step asks the agent to
  pitch three social accounts, a showcase submission form, and an @-mention.
  Upstream #91 (2026-09-27) added more Showcase links to the README, which
  confirms the direction. It does not change the decision.
  Trove skills do not market a third party from inside a workflow. Attribution
  belongs in `THIRD_PARTY.md` and each skill's license notice. The delivery step
  keeps only the technical handoff.
- **Asset licensing is surfaced, not assumed.** `assets/audio/ATTRIBUTION.md`
  records Mixkit free-license SFX with six files whose provenance could not be
  recovered and which upstream says must be confirmed before commercial use.
  Because Trove ships no audio, the skill's obligation is to tell the user to
  check that file before publishing rather than to imply cleared rights.
- **Remotion licensing is the user's decision.** Remotion is free for
  individuals and small teams and may require a paid company license. State it
  once, at the point where a render is about to be produced, with a link.
- **Data safety survives the port.** Public demo data may be kept only on
  explicit confirmation; customer, personal, internal, credential, and live
  data must be fictionalized or masked and frozen before capture. This is
  carried verbatim in intent and reinforced as an eval criterion.
- **Third-party motion research stays upstream's claim.** `references/shots/
  ATTRIBUTION.md` documents that card techniques were studied from published
  promos and reimplemented from scratch. Trove does not restate that table or
  imply any rightsholder endorsement; not vendoring the cards keeps the claim
  where its evidence lives.
- **Pacing feedback is directional.** The source records that all historical
  feedback said "slower / hold longer" and none said "too slow". Keep the
  concrete numbers (wordmark hold ≥1 s, 0.5 s settle after batch motion, 3 s
  for an opening subject action) as budgeted frames, not as vibes.
- **No auto-attach globs.** A promo pipeline should not fire on
  `remotion.config.ts`; presence of a Remotion project does not mean someone is
  making a product video. All four skills are trigger- and request-activated,
  the same choice made for `trove-obsidian-cli` and `trove-web-clip`.

## Licensing and provenance

Upstream is Apache-2.0 while Trove is MIT. Apache-2.0 §4 requires retaining the
license, copyright, and attribution notices and stating that files were
changed, so:

- Each of the four skills carries the full Apache-2.0 notice plus a
  "changes made" statement at `references/LICENSE.md`, mirroring how the
  documentation skills carry their MIT notice so it survives standalone skill
  installation and every host projection.
- `upstream.yaml` gains a source entry `id: video-shotcraft`, repository URL,
  `license.expression: Apache-2.0`, `evidence: LICENSE`, and `artifacts: []` —
  a curated adaptation with pinned provenance, the same shape as
  `cursor-pstack` and `obsidian-skills`. No byte sync is claimed.
- Four rows are added to `upstream.yaml`'s `skills:` list with
  `origin: adapted`, `source_id: video-shotcraft`, the upstream path each was
  adapted from, and `evidence_sha` set to the head re-verified in Phase 1
  (`5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab` as of 2026-10-04, not the
  original `5e71af3`). The source entry and rows are written by
  `bun run import:skill --stage --mode adapted` (ffmpeg plan, CP2–CP3), not
  by hand.
- Each row's `upstream_path` must name the adapted files, not the repository
  root. Upstream churn is almost entirely in `workbench/` and `template/`, and
  a root-level path would make every workbench commit look like review drift.
  Three of the four skills draw on more than one file, but a `skills:` row
  holds one `upstream_path` today. The ffmpeg plan's CP6 ("review due" for
  adapted sources) should accept a list for that reason. Until it does, record
  the primary file and list the rest in a YAML comment.
- `THIRD_PARTY.md` gains a `## video-shotcraft` section naming the author, the
  license, the reviewed revision, what was adapted, and what was deliberately
  excluded (assets, template, demos, workbench, gallery media, author promotion).

Trove's MIT license applies to Trove's own authored text; the Apache-2.0 notice
governs the adapted material. Nothing is relicensed.

## Files to add and change

Hand-authored:

- `skills/media/{trove-product-video,trove-shot-recipes,trove-beat-sync,trove-video-review}/SKILL.md.tmpl`
- the matching `references/LICENSE.md` for each, plus focused references where a
  body would otherwise exceed budget — expected: `references/pipeline.md` and
  `references/modes.md` for the pipeline skill, `references/card-protocol.md`
  and `references/aesthetic-rules.md` for shot recipes,
  `references/beat-analysis.md` and `references/sound-design.md` for beat sync,
  `references/review-checklist.md` for review
- `plugins/trove-media/plugin.yaml` — four skill entries added, all seven
  platforms each. The file itself, its category, and its roles come from the
  ffmpeg plan
- `plugins/trove-media/README.md` — add a section for the four skills
- `marketplace.yaml` — extend the existing `trove-media` tags (`remotion`,
  `promo-video`, `motion`); no new entry
- `evals/skill-evals/<skill>/rubric.yaml` + `tasks/*.md` for all four
- `tests/trove-media.test.ts` — extend the file the ffmpeg plan creates
- `README.md` — update the existing plugin row's description

Generated — never edited by hand: `plugins/trove-media/skills/**`, the per-host
`.agents` / `.copilot` / `.claude-plugin` / `.cursor-plugin` / `.codex-plugin`
/ `.plugin` trees, `plugins/trove-media/routing.md`, `docs/routing.md`,
`catalog.json`, `deps.json`, the four `marketplace.json` files, and
`output/**`.

`benefits-from` edges to declare: `trove-product-video` benefits from
`trove-shot-recipes`, `trove-beat-sync`, and `trove-video-review`;
`trove-video-review` benefits from `trove-shot-recipes`; `trove-product-video`,
`trove-beat-sync`, and `trove-video-review` each benefit from `trove-ffmpeg`.
These feed `deps.json`.

Each skill carries only its own rows of the `trove-ffmpeg` step table. A row
names the script and the one mode flag the step depends on (`--beats`,
`--measure-only`, `--at`, `--content`). Every other flag stays in
`trove-ffmpeg`'s vendored manual, because repeating them here would fork a
manual that changes weekly.

## Implementation phases

**Phase 0 — prerequisites.** Do not start until the ffmpeg plan's CP5 has
shipped `trove-ffmpeg` and CP3 has shipped `/import-skill`. Gate:
`./bin/trove info trove-media` lists `trove-ffmpeg`, and
`bun run import:skill --inspect` exists.

**Phase 1 — re-pin, read, and decide.** Run `/import-skill` in inspect mode
against the then-current upstream head. If the head has moved past `5ddbf52`,
diff the adapted paths only (`SKILL.md`, the eight references,
`sequences/`, `shots/`, `template/TEMPLATE.md`, `template/THEMES.md`), and
record any change in "Upstream changes since the first review". Then read all
adapted references, including `sequences/promo-energy-arc.md`, and a
representative sample of cards across the ten card categories. Record, per
document, which rules are asset-independent (port), which are library-bound
(port as protocol), which become `trove-ffmpeg` calls (the step table), and
which are upstream-infrastructure-only (drop). Gate: that mapping is written
down before any skill body is authored, and every inspect-mode flag is either
resolved or recorded as an accepted risk.

**Phase 1b — beat-analysis comparison.** On at least three strong-beat tracks
from `assets/audio/bgm/` (read from the user's checkout, not vendored), run
`scenes.py --beats` and, with consent for the `uv` download, the upstream
librosa fit. Compare BPM, phase, and per-beat residuals against upstream's
gate. Gate: a recorded result table that decides the order in "Beat analysis".
This phase runs vendored and upstream code on local files only, and is
reported as a manual result.

**Phase 2 — evals first.** Write the four rubrics and their task prompts
before the bodies, following the `trove-web-clip` shape. Cases must cover:

- mode selection without a pre-chosen mode;
- an explicitly named mode (no re-asking);
- a named card with the library present;
- a named card with the library absent (degraded mode, no invented recipe);
- sensitive page data;
- a non-trigger request;
- instructions embedded in page or card content.

Integration cases:

- `trove-ffmpeg` absent: render proceeds, and checks are listed as unchecked,
  not passed;
- a request for "a vertical version for Reels": recompose, not `--fit crop`;
- a request to "just strip the music" for the no-BGM version: render with
  props, not ffmpeg;
- beat sync with no consent for `uv`: `scenes.py --beats` result, gate
  applied, honest fallback;
- a delivery to YouTube: loudness on the BGM version, then re-test on the
  normalised file, then `check.py`.

Gate: `bun run eval:structure` passes with the new rubrics.

**Phase 3 — author the skills.** Write the four templates and their references
in English within budget. Gate: `bun run build:skills` then `bun run validate`
with zero errors.

**Phase 4 — package.** Add the four skill entries to the existing
`plugin.yaml`, extend the marketplace tags, and add the license notices; run
the full five-stage build. Gate: `bun run build` clean,
`bun run validate` clean, `bun run validate:claude-manifests` clean, and the
new skills present in all seven projection surfaces.

**Phase 5 — provenance and docs.** Stage the `upstream.yaml` source and rows
with `import:skill --stage --mode adapted`. Then update `THIRD_PARTY.md` and
the `README.md` row, and regenerate routing. Gate: `bun run verify:generated`
passes, including the clean-worktree freshness check and the generators'
`--dry-run` determinism checks. Once the ffmpeg plan's CP6 lands,
`sync:upstream --check` lists `video-shotcraft` as current. A workbench-only
upstream commit must not mark it "review due"; prove that with a fixture.

**Phase 6 — tests.** Add `tests/trove-media.test.ts` covering: the Apache
notice and its "changes made" statement present in every bundled destination,
reference links rewritten to each skill's own copy, provenance rows resolving
against `upstream.yaml`, no auto-attach globs on any of the four, and no
residual Chinese text or `{{...}}` in generated bodies. Integration
assertions:

- No code line in any of the four bodies or references starts with `ffmpeg` or
  `ffprobe`. This makes the "no raw ffmpeg" rule structural rather than prose.
- Every `trove-ffmpeg` script a skill names exists in
  `skills/media/trove-ffmpeg/scripts/`, so a script renamed by a sync fails
  here, not at a user's prompt.
- Each skill that names a `trove-ffmpeg` script declares
  `benefits-from: [trove-ffmpeg]`.

Write each assertion so it fails against the pre-change tree first. Gate:
`bun test ./tests` green.

## Verification contract

Run, and report each separately: `bun run build`, `bun run validate`,
`bun run validate:claude-manifests`, `bun test ./tests`,
`bun run eval:structure`, `./node_modules/.bin/tsc --noEmit`,
`bun run verify:generated`, and `./bin/trove info trove-media` plus
`./bin/trove search video`.

Scope tests to `./tests`; plain `bun test` also discovers incompatible tests
inside the ignored `_sample` checkouts, including this source's own vitest
suite.

What a green build does **not** establish, and must not be claimed:

- that a real promo renders;
- that either librosa or `scenes.py --beats` reproduces the stated ≤3-frame
  cut accuracy on a given track (Phase 1b measures this on specific tracks
  only);
- that the CapCut path works;
- that any card's motion was faithfully reproduced;
- that loudness normalisation leaves the measured output offset unchanged.

Those need a live run against an actual `video-shotcraft` checkout with
Node 22, Chrome/Chromium, `ffmpeg`, and a real project. One end-to-end smoke
run is worth doing before release:

1. Render the template with a non-default theme, in both the BGM and no-BGM
   versions.
2. Run `loudness.py` on the BGM version.
3. Re-test cut error on the normalised file.
4. Run `check.py --platform youtube --content` on both files.

Report it as a manual result with the artifact paths and measured numbers,
not folded into CI.

## Open decisions for the user

1. **Plugin scope.** *Resolved 2026-10-04:* `trove-media` is a general media
   plugin. `trove-ffmpeg` ships first; these four skills are wave 2, after it.
   The plugin, its `plugin.yaml`, and its marketplace entry are created by the
   ffmpeg plan, so this plan only adds skill entries.
2. **Library dependency.** *Resolved 2026-10-07 (#28):* support both, with a
   user-supplied checkout path preferred. The skills establish where the library
   is — a path the user gives, an installed `video-shotcraft` skill directory,
   or a clone the user explicitly authorizes — and state plainly what is
   unavailable without it. No silent clone.
3. **End-to-end smoke run.** *Resolved 2026-10-07 (#28):* record the render as a
   manual result, do not block the release on it. #34 runs one real render
   against the Ink Press template when Node 22 and Chromium are available and
   writes `dev-doc/media-verification/issue-34.md`. A failure is reported and
   opened as a bug, but it does not gate the epic's final PR.
4. **Beat analysis order.** **`scenes.py --beats` first, librosa through `uv`
   only with consent when the gate fails**, or librosa first (upstream's
   path). Phase 1b's measurement can overturn the default.
5. **Delivery loudness.** **Normalise the BGM version to the named
   destination's target and re-test sync on the normalised file; measure the
   no-BGM stem only**, or deliver Remotion's levels untouched and only report
   `check.py` results.

Already settled (2026-10-04): wave 2 starts after `trove-ffmpeg` ships, and all
five skills live in `trove-media`.
