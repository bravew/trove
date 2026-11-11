# trove-video-edit render (BuildLoop wave B)

The CP7 check: render a preview and a final for an Intro clip and a Shorts
clip, then measure the finals with `trove-ffmpeg`'s `check.py`.

## Result

All four renders completed on Remotion 4.0.542, and both finals passed the
delivery check with no failures. The title beat and the zoom beat were measured
in the frames, not assumed from the plan.

These four renders use generated footage. They exercise source resolution and
rendering, but do not satisfy the manual workflow on real talking-head footage.
The earlier statement that no real clip was available was incorrect; the local
`assets/video/greenscreen.mp4` is available and was used in the later preview
below. It is b-roll, not a multi-take speech recording.

The talking-head run at the end of this note is the CP7 acceptance run. Its two
previews were approved by the user, and its two finals pass the delivery check
with no failures.

## Environment

| Item | Value |
|---|---|
| Date | 2026-11-10 |
| Branch | `feat/november-refresh` at `261a436`, with the wave uncommitted |
| Remotion | 4.0.542, with `@remotion/cli` 4.0.542, React 19.2.3, zod 4.6.7 |
| ffmpeg / ffprobe | 9.0.2 |
| python3 | 3.15.2 |
| OS | macOS, arm64 |

## Why the renders did not run in the checkout

Every `remotion render` run from
`skills/media/trove-video-edit/assets/remotion/` timed out with
`Waiting for root component to load` after the loading handle had already
cleared. The same source, the same `bun.lock`, and the same resolved versions
render in a copy on the internal disk.

The difference is the browser binary's location. Rendering the identical bundle
with the browser on `/tmp` succeeds from the checkout, and rendering with the
browser kept on the volume fails from `/tmp`. Copying the volume's browser to
`/tmp` makes it work, and the two copies hash the same, so the files are fine.
The volume is an external APFS SSD mounted with ownership disabled. The hang is
a property of this machine, and the skill does not mention it.

## Input

`source.mp4`, generated with ffmpeg's `testsrc2` and a 440 Hz tone. Six
seconds, 640x360, 30 fps, h264 and aac, 97 KB.

The plan has two beats. A title, "The point", from 1 s to 3 s, anchored on
"the point". A zoom from 3.5 s to 5 s, anchored on "and then".

`plan.source` is the bare filename `source.mp4`, and the clip was copied into
the composition's `public/` folder. An absolute path and a plain
`/source.mp4` both 404 in the renderer, which looks inside the bundle. Remotion
only serves that folder through `staticFile()`, so the composition wraps the
filename itself.

## Renders

| Render | Command | Output |
|---|---|---|
| Intro preview | `remotion render src/index.ts Edit intro-preview.mp4 --scale 0.5` | 960x540, 180 frames, 6.016 s, 377 KB |
| Shorts preview | the same, with `plan.mode` set to `shorts` | 540x960, 180 frames, 6.016 s, 312 KB |
| Intro final | the same without `--scale` | 1920x1080, 180 frames, 6.016 s, 673 KB |
| Shorts final | the same, `shorts` | 1080x1920, 180 frames, 6.016 s, 411 KB |

The extra 16 ms over the 6 s plan is the AAC encoder priming, one frame of
audio. The frame count matches the plan exactly.

## What the frames show

Three frames from the Intro final, sampled for rows that are white:

| Time | Beat active | White rows |
|---|---|---|
| 0.5 s | none | none |
| 2.0 s | title | two bands, rows 887 to 897 of 1080 |
| 4.2 s | zoom | none |

The text appears only inside its beat, and it sits in the lower third rather
than over the middle of the frame.

The test pattern cannot show a 6% zoom, so a second clip was made with one
white square on black and rendered as stills. The square measures 190 px
outside the zoom beat and 202 px inside it, which is the 1.06 scale, and its
centre does not move. The overlay is a layer above the scaled picture, so the
zoom cannot crop it.

## Delivery check

`check.py --no-loudness --content`, from the vendored `trove-ffmpeg`.

| File | Platform | Result |
|---|---|---|
| Intro final | youtube | 16 checks, 0 failed, 2 warnings |
| Shorts final | shorts | 16 checks, 0 failed, 2 warnings |

Both warnings are the same on both files. The colour tags are
`bt709/iec61966-2-1` where the check wants `bt709/bt709`, and there is no
subtitle track. Neither is this skill's to fix. Colour tagging belongs to
`trove-ffmpeg`'s `color.py`, and captions are a beat the plan did not ask for.
The content rows all pass: nothing black, nothing frozen, no silence, no
dropouts, no flashes.

## Review

Measured after the renders. `loudness.py --measure-only` reads -21.8 LUFS and
-20.7 dBTP on both finals, so nothing clips. The `check.py --content` rows are
in the table above.

This is not a certification. The skill refuses to certify a video from the
context that produced it, and it asks for a separate reviewer. The rows below
are the evidence that review would start from.

Q. `check.py --content` reports nothing black, frozen, silent, flashing, or
dropped out on either final. The title is on screen at frame 60 and absent at
frames 15 and 126. A marked square measures 190 px outside the zoom and 202 px
inside it, and its centre does not move.

A6. True peak -20.7 dBTP on both finals. Integrated loudness -21.8 LUFS. No
clipping.

Unchecked, because the inputs do not exist. P, F, V, S, and B need a brief, a
storyboard, and an approved direction, and none was supplied. D needs a
data-use policy. A8 needs a second export from the same timeline. A10 needs
sound effects, and none were supplied. The footage is generated, so nothing
here is a claim about a real subject.

## Real-footage preview attempt

`/tmp/trove-render/intro-preview.mp4` rendered from the local 49-second
`assets/video/greenscreen.mp4` at scale 0.25 using Remotion 4.0.542. The render
completed 1470 frames. The full headless-browser bundle was copied to
`/tmp/trove-render/browser/`; copying only its executable failed because
`icudtl.dat` was missing.

This is an additional rendering smoke test, not CP7 acceptance. Its 49-second
duration exceeds the skill's 30-second Intro limit. Its `confetti` and `cake`
anchors were labels authored for the test, not words established by a
transcript. No preview approval was received and no final from this source
was rendered.

## Image-only beat

An image beat with an asset and no text rendered nothing. The old overlay
returned null whenever `beat.text` was absent, so the image branch was never
reached. `lint_plan.py` accepts this plan because it checks the asset path and
does not render the beat.

The fixture is a 320 by 160 SVG filled with `#ff00ff`, saved as
`/tmp/trove-render/public/image-beat-test.svg`. The plan is one image beat from
0 s to 1 s, with `image-beat-test.svg` as its asset. Frame 15 was rendered at
1920 by 1080 with Remotion 4.0.542.

| Still | Magenta pixels | Bounds |
|---|---|---|
| `/tmp/trove-sync/image-beat-before.png` | 0 | none |
| `/tmp/trove-sync/image-beat-after.png` | 107,184 | rows 695 to 925, columns 728 to 1191 |

The before and after files are not byte-identical. The after rectangle is 464
by 231 pixels, in the lower third, and the source remains visible around it.
The composition now uses Remotion `Img` and `staticFile(beat.asset)`. An image
beat without an asset throws. `tsc --noEmit` in `assets/remotion/` exits 0.

The first after render was identical to the before render because it used a
stale copy of `Edit.tsx` in `/tmp/trove-render`. The measured result is from the
render made after copying the canonical source there. This checks one beat on a
test asset. It is not a preview approval or a final delivery.

## Independent review

The separate review is `/tmp/trove-sync/independent-video-review.md`, with probes
and frames in `/tmp/trove-sync/independent-review-evidence-FM9FPi`. It measured
the two generated finals and the 49-second preview. It is not a certification.

Its required corrections are unfinished green areas in the preview, the
preview's 480 by 270 size and soft text, its full-range BT.601-matrix tagging,
91% of the preview below -50 dBFS, `iec61966-2-1` transfer tags on both short
files, and the large black area separating the portrait image from its caption.
Plan, storyboard, direction, reference, caption, provenance, data-policy, and
BGM comparisons stay unchecked because those inputs were not supplied.

## Talking-head previews, 2026-11-10

Source: `_sample/ffmpeg-skill/demos/footage/ai_talk_en.mp4`, 15.04 s, 854 by
480 at 24 fps, mono AAC. It is AI-generated footage of one speaker, per the
sample's `docs/demos.md`, with no burned-in label. It is the only unlabelled
talking-head clip in the inspected samples, and no real portrait clip exists.
`filler_en.mp4` and the CP6 cut were ruled out because every frame carries a
"BEFORE" or "AFTER" label.

The Intro source is the clip as it is. The Shorts source is the same clip
reframed by `trove-ffmpeg`'s `fit.py --aspect 9:16 --fit crop`, a centre crop
to 270 by 480. The speaker's white shirt is centred at 0.53 of the width in
frames at 1, 4, 8, and 12 s, so the centre crop keeps them in frame.

The transcript came from `faster-whisper` `small` with a filler-laden initial
prompt. It reads "Hey! Uh, hello there! Well, um, good morning! Hope you're
having a good day!", with speech ending at 9.10 s. No name or term needed a
correction. Each plan has three caption beats, one per line, from 0 to 2.6 s,
3.78 to 5.9 s, and 7.06 to 9.5 s. The captions drop the fillers. No title,
zoom, or image beat earned a place in a three-line greeting. The user supplied
no music, so the cut stays on its own sound. `lint_plan.py --fps 24` printed
`PLAN: sound (3 beats)` for both.

Renders used Remotion 4.0.542 from `/tmp/trove-render`, with the browser on
the internal disk for the reason given above, at `--scale 0.5`.

| Preview | Size | Frames | Duration | `check.py --content` |
|---|---|---|---|---|
| `/tmp/trove-sync/cp7/preview_intro.mp4` (youtube) | 960x540 | 361 | 15.042 s | 18 checks, 0 failed, 4 warnings |
| `/tmp/trove-sync/cp7/preview_shorts.mp4` (shorts) | 540x960 | 361 | 15.042 s | 18 checks, 0 failed, 4 warnings |

The four warnings are the same on both: the preview resolution, a `bt470bg`
matrix tag with untagged primaries and transfer, no subtitle track, and 57% of
the running time below -50 dBFS. The silence is in the source, which idles for
almost 6 s after the last word.

Caption pixels were counted in the lower third. These were pixels near white
in the preview and not near white in the source at the same time. Intro gave
878, 1127, and 1808 inside the three beats and 0 at 3.0, 6.5, 9.8, and 12.0 s.
Shorts gave 482, 776, and 1476 inside and 0 at the same four times. Stills at
1 s show the caption under the speaker's face in both modes, not over it. The
caption uses the browser's default serif, because the skill sets no house
style.

### Approval and finals

The user approved both previews as they stood, through the session's question
dialog on 2026-11-10. The finals were rendered from the same two plans, the
same sources, and the same Remotion setup, without `--scale`.

| Final | Size | Frames | Duration | `check.py --content` | Loudness |
|---|---|---|---|---|---|
| `/tmp/trove-sync/cp7/final_intro.mp4` (youtube) | 1920x1080 | 361 | 15.042 s | 18 checks, 0 failed, 3 warnings | -13.0 LUFS, TP -3.0 dBTP, LRA 2.1 LU |
| `/tmp/trove-sync/cp7/final_shorts.mp4` (shorts) | 1080x1920 | 361 | 15.042 s | 18 checks, 0 failed, 3 warnings | -13.1 LUFS, TP -3.2 dBTP, LRA 2.2 LU |

The preview-resolution warning is gone. The three that remain are the ones the
previews had. The `bt470bg` matrix tag comes from the source, and fixing it is
`trove-ffmpeg`'s `export.py`. There is no subtitle track because the captions
are burned in. The 57% silence is the source's idle tail after 9.1 s. Trimming
it would change an approved cut, so it was left.

Loudness was measured with `loudness.py --measure-only` and not normalised. No
true peak is above -3 dBTP.

Caption pixels in the finals, counted at half size the same way as the
previews: Intro 742, 936, and 1469 inside the three beats and 0 at 3.0, 6.5,
9.8, and 12.0 s. Shorts 409, 640, and 1209 inside and 0 at the same four times.
Stills at 4.5 s (Intro) and 8 s (Shorts) show the caption over the shirt, under
the face.

### Independent review

A separate reviewer inspected the unchanged finals under
`/tmp/trove-sync/cp7-review/review.md`. Neither delivery is certified. The
review requires four corrections:

- Reconcile the transcript with measured audio activity before retiming
  captions. Captions follow the approved plans, but measured silence conflicts
  with the transcript's stated phrase starts.
- Correct colour signalling. The finals are full-range `yuvj420p` with a
  `bt470bg` matrix and no primaries or transfer tags.
- Resolve the measured silent tail from 9.849167 s to 15.018667 s, or define
  its purpose. Do not trim at the unvalidated transcript endpoint.
- Move Shorts captions above the bottom interface guide. The review measured
  them around rows 1775 to 1830, inside the guide beginning at row 1574.

The review confirms both dimensions, 361 frames, no detected black frames,
freezes, flashes, or short dropouts, and source-relative audio and picture
correlation at zero offset. Loudness is -13.02 and -13.09 LUFS, with true peaks
-3.01 and -3.18 dBTP. Brief, storyboard, brand, data-policy, listening, and
intrinsic lip-sync checks remain unchecked.

### Correction probes, not replacement finals

A five-frame encoded probe rendered with Remotion `--color-space bt709` is
limited-range `yuv420p`, with matrix, primaries, and transfer all tagged
`bt709`. It is `/tmp/trove-sync/cp7/color_probe.mp4`. The skill now requires
that flag for SDR finals.

The old CSS percentage padding did not move the portrait caption because the
8% inset was smaller than the text block. The composition now uses 20% of the
height in portrait and 8% in landscape. A corrected still at frame 192 places
white caption rows from 1328 to 1533, above the guide at row 1574, with a
386-row bottom margin. The caption wraps to three lines over the shirt. The
still is `/tmp/trove-sync/cp7/placement_shorts_safe.png`. ### Corrected full renders

Corrected full-size renders are in `/tmp/trove-sync/cp7/corrected/`. They use
the revised composition, `--color-space bt709`, and plans aligned to measured
speech groups at 0.52 to 2.48 s, 3.98 to 5.90 s, and 7.58 to 9.30 s. Each
caption has a short reading tail. The source is trimmed at 10.0 s, 0.7 s after
the last measured speech. The earlier approved finals were not overwritten.

| Final | Format | Frames | Colour | Delivery | Loudness |
|---|---|---|---|---|---|
| `final_intro.mp4` | 1920x1080 | 240 | limited-range yuv420p, bt709/bt709/bt709 | 18 checks, 0 failed, 1 warning | -13.03 LUFS, -3.0 dBTP |
| `final_shorts.mp4` | 1080x1920 | 240 | limited-range yuv420p, bt709/bt709/bt709 | 18 checks, 0 failed, 1 warning | -13.09 LUFS, -3.2 dBTP |

The remaining warning on both is the absent selectable subtitle track. Exact
frame comparisons show captions at frames 12, 146, and 182 and none at frames
95 and 228. The portrait caption at frame 182 occupies rows 1328 to 1533, above
the bottom guide at row 1574. Isolated bright rows at frame 64 are source
highlights, not caption text. No listening review establishes the exact
phoneme boundaries. A fresh independent review is
`dev-doc/media-verification/2026-11-video-edit-corrected/independent-review.md`,
copied from `/tmp/trove-sync/cp7-corrected-review/review.md` with SHA-256
`fef6cdf5ff401d367b0de86cbdca664d79df9890cc94a7155cbee123fd05bfb8`.
It finds no required correction in the measured criteria. Colour, caption
timing, Shorts placement, loudness, the shortened ending, and source-relative
sync match the evidence above. It does not certify either file. Brief,
storyboard, brand, music, sound-effect, listening, and data-policy inputs were
not supplied and remain unchecked. Evidence is in
`dev-doc/media-verification/2026-11-video-edit-corrected/`.

The plans, transcript, preview and final checks, and hashes are in
`dev-doc/media-verification/2026-11-video-edit/`.

## Plan lint fixes after review

A later review of `lint_plan.py` found plans it accepted that the composition
would draw wrong or not at all. Each fix has a test in
`tests/trove-media-scripts.test.ts` that failed on the old code and passes now.

- A caption with no text renders blank, so it now fails like the other text
  kinds.
- An empty source, a path, or a dotted name fails, because the composition
  resolves `plan.source` as a bare filename in `public/`.
- A kind outside the schema's nine, a non-finite time, and a negative start
  each fail.
- The overlap check compared seconds. The composition rounds each beat's start
  and length to frames on its own, so beats at 0.02 to 1.04 s and 1.04 to 2 s
  both draw frame 31 at 30 fps. The check now compares frames.
- The frame check first read `plan.fps`, which the plan schema forbids. The
  frame rate now comes from `--fps`, default 30, the composition's default. A
  rate that is not positive is refused.

`assets/remotion/package.json` now lists `zod` 4.6.7, because `Edit.tsx`
imports it and the manifest did not name it. None of the
renders above were repeated after these changes.

## Rubric scores

The later full new-model baseline scored all four `trove-video-edit` tasks at
8.9, 8.8, 9.2, and 8.5 on `claude-sonnet-5-5` at effort `high`. Every task
passed. The rows are in `dev-doc/model-refresh/2026-11-judge-baseline.tsv`.
These judgments estimate responses from the skill text. They do not establish
preview approval or replace the required talking-head renders.
