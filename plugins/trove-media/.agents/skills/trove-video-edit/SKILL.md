---
name: trove-video-edit
description: "Edit a pre-cut talking-head video: captions, overlays, zooms, and a music bed. Use when the cut is already made and the edit is what remains. Not for raw multi-take footage and not for finding b-roll in a clip."
metadata:
  inspired-by: "BuildLoop video skills"
  trove-category: designs-media
  trove-category-label: "Designs & media"
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

# Video edit

A pre-cut talking-head clip gets captions, overlays, punch-in zooms, and a
music bed. The cut already exists. Choosing takes belongs to `trove-take-cut`,
finding b-roll in raw footage belongs to `trove-broll-ingest`, and checking the
finished piece belongs to `trove-video-review`.

Everything on screen comes from one file, `edit_plan.json`. If it is not in the
plan it does not get rendered. That is what keeps the edit reviewable: the plan
is the edit, and the render is a projection of it.

## Modes

Probe with `trove-ffmpeg`'s `probe.py` and pick from the geometry.

| | Shorts | Intro | Longform |
|---|---|---|---|
| Shape | Portrait, 9:16 | Landscape, up to 30 seconds | Landscape, longer |
| Density | A few beats, hand placed | A few beats | One every half minute or so, per section |

Read `references/runtime-spec.md` in `trove-ffmpeg` before the first command.
Never write a raw ffmpeg command.

## The plan

1. **Transcribe** to word level and write `words.json` in the shape
   `trove-take-cut` defines. The transcript is the timing source for every beat.

2. **Correct it yourself.** Read the transcript against the script when the user
   supplied one, and against what you can hear otherwise. Fix names and terms
   the recognizer got wrong and write each correction down. There is no second
   model and no API call for this. You are the pass.

3. **Author the beats.** One per moment that earns it. Each names the words it
   lands on (`anchor`, copied from the transcript) and what the viewer
   understands from it that the words alone do not carry (`reason`). A reason of
   "this adds energy" is not a reason. Drop that beat. The kinds and when to
   use each are in [overlays.md](references/overlays.md). The file matches
   [edit-plan.schema.json](references/edit-plan.schema.json).

4. **Lint before anything renders.** Run `scripts/lint_plan.py` with the probed
   duration, and with `--fps` when the composition renders at a rate other than
   its default of 30. The plan carries no frame rate. A failing plan does not
   render. Fix the plan.

Music, sound effects, and images come from directories the user supplies. This
skill ships none, fetches none, and generates none. A moment with no asset
gets no image beat.

## Preview, then final

Render a preview first: a short, low-resolution pass that is cheap to throw
away. Show the user the file and stop. The final render happens only after they
approve the preview in this session. Re-renders after feedback stay at preview
until they approve again.

State once, before the first render, that Remotion is free for individuals and
small teams, that companies may need a paid license, and link the
[Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
Render SDR finals with `--color-space bt709`. Remotion then converts the pixels
to limited range and tags the matrix, primaries, and transfer as BT.709.
The composition lives in `assets/remotion/` and reads the plan. It renders the
speaker and the overlays as separate layers, so a zoom on the speaker never
crops an overlay. Copy the clip into that directory's `public/` folder and name
it in `plan.source` as a bare filename. The composition resolves it with
`staticFile`, which is the only path form Remotion's renderer can fetch.

## Audio

Score the approved render, not the preview. Duck the music under the voice and
normalize loudness with `trove-ffmpeg`'s `audio.py` and `loudness.py`. When the
user supplied no music, the cut ships silent rather than with a bed they did
not choose. Then hand the result to `trove-video-review`.

## What this skill does not decide

Colors, type, and pacing beyond the rules in `overlays.md` come from the
user's project. There is no default brand, no default music, and no default
call to action. Ask when a choice would change the result, and leave the moment
unadorned when there is nothing to ask.
