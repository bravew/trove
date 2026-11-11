---
name: trove-broll-ingest
description: "Find the usable moments in raw footage, cut each one, grade it, and add it to a b-roll library. Use when a raw clip or a folder of raws needs selecting, grading, and cataloguing. Not for a talking-head script and not for a finished edit. Use when: find the usable moments in this clip; ingest this footage into my b-roll library; grade and catalog this raw clip; pull the good shots out of this footage."
license: MIT
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

# B-roll ingest

A raw clip becomes a handful of graded selects in a catalog, each one a moment
an edit can drop in. Cutting a talking-head script belongs to `trove-take-cut`.
Finishing an edit belongs to `trove-video-edit`.

The library root comes from the user. There is no default path. If they did not
name one, ask, and do not create a library anywhere they did not point at.

## Grade from the transfer, not from habit

Probe the clip with `trove-ffmpeg`'s `probe.py` and read the transfer
characteristics before choosing a LUT. S-Log3 footage graded with a Rec.709 LUT
comes out flat and wrong, and the mistake is invisible until the shot sits next
to a correctly graded one.

| Probed transfer | LUT |
|---|---|
| Rec.709, BT.709 | `assets/luts/cinematic-rec709.cube` |
| S-Log3, S-Gamut3 | `assets/luts/cinematic-slog3.cube` |
| Anything else | Stop and ask. Do not guess a grade. |

Each has a `-soft` variant for a lighter grade. The user can pass their own
`.cube`, which overrides the choice entirely. Apply it with `color.py --lut`.

## Workflow

Read `references/runtime-spec.md` in `trove-ffmpeg` before the first command.
Never write a raw ffmpeg command. The source clip is never modified.

1. **Probe.** Transfer characteristics decide the grade. Note the frame rate and
   duration for the cuts.

2. **See the whole clip.** Build a timestamped contact sheet with `look.py` and
   read every frame of it. For a clip where the action is easy to miss, build a
   second sheet over just that span. The sheet is how you find moments. Scene
   detection and the filename are not.

3. **Name the moments.** Read [selection-rules.md](references/selection-rules.md)
   and write one sentence per select naming what happens and at what second.
   Most clips yield none to four. Show the list to the user before cutting.

4. **Cut and grade.** `cut.py --accurate` for the span, then `color.py --lut`
   with the LUT chosen above. Exposure or white balance problems get
   `color.py --correct` before the grade, not instead of it. Name the file
   `<category>_<moment>_<source>.mp4` inside the library.

5. **Check the opening frame.** Extract the first frame with `look.py --at` and
   look at it. If it shows anything other than the action already happening,
   the span starts too early. Re-cut.

6. **Shake, only when it helps.** Run `scripts/shake.py` on a shot that looks
   unsteady. Stabilize a locked shot through `trove-ffmpeg`, score the result,
   and keep it only when the score dropped. Never stabilize a pan, tilt, or any
   move the camera made on purpose. Record the decision either way.

7. **Catalog.** Append the select with `scripts/catalog.py`, pointing `--library`
   at the root the user named. The entry matches
   [catalog.schema.json](references/catalog.schema.json).

## The LUTs

The four `.cube` files under `assets/luts/` are a cinematic grade carried over
from the BuildLoop video skills, kept byte for byte and renamed. They are a
starting grade, not a house look. A project with its own grade should pass it.
