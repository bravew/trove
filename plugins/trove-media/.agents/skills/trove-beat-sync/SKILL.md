---
name: trove-beat-sync
description: "Fit and validate a music beat grid before storyboarding, map motion and cuts to beatF(n), control full-frame impacts, compensate measured audio offsets, and verify beat sync on delivered renders. Use when a video timeline needs music-driven timing or BGM and no-BGM versions."
metadata:
  source: Vincentwei1021/video-shotcraft
  upstream-skill: "music-beat-sync and sound-design"
  upstream-revision: 5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

# Beat-synced timelines

Use this skill when a chosen music track should shape a video timeline. Analyze and accept the beat grid before storyboarding. If no track is chosen, pace the edit to its content and leave beat sync for later. Defer media measurements and normalization to `trove-ffmpeg`.

## Measure and accept the grid

1. `scenes.py --beats` requires a video stream, so it cannot read an audio-only track directly. For an audio-only track, first get consent to create temporary media. Use `background.py` to make a silent carrier at least as long as the track, then `audio.py --replace` to add the track. Read the installed manual for file arguments. Run `scenes.py ANALYSIS_VIDEO.mp4 --beats`. Do not claim direct MP3 support.
2. Record BPM, phase, onset count, supported-beat count, confidence, and `usable` from the result. Check likely half-time and double-time interpretations against supported onsets. Do not choose a tempo from the scalar alone.
3. Apply the acceptance gate in [Beat analysis](references/beat-analysis.md). `usable: true` is necessary, but it does not prove every residual criterion. Do not claim match or residual limits passed unless measured evidence provides them.
4. If the gate fails or the grid remains uncertain, ask before running `uv run --with librosa --with scipy --python 3.11`. State that the command downloads packages. Without consent, report the measured result and use content pacing. Do not quietly install, download, or substitute another package.
5. When `trove-ffmpeg` is unavailable, mark grid analysis and dependent checks unchecked. Do not invent command output.

## Build the timeline

Keep source phase and beat interval in floating-point seconds. Convert to frames only when writing the Remotion timeline. Use one shared `beatF(n)` function for beat-anchored cuts and keyframes. Keep source phase unchanged when compensating output offset. The formula and an example are in [Beat analysis](references/beat-analysis.md).

Use the grid for regular cuts and tightly repeated steps. Anchor isolated accents and ending holds to measured transients. Treat onsets as candidates, not automatic instructions for a visual hit. Let dense drums carry rhythm without pulsing the whole frame on every beat.

Allow no more than three full-frame impacts in the entire video. Match each one to a strongest measured hit, with at least sixteen beats between impacts. Keep ordinary beat movement on the subject or graphic layer. Do not turn every beat into a zoom, shake, flash, or inversion.

## Align sound and compensate offsets

Align sound effects by their audible peak, not by the source file's first sample. Measure the output audio offset for the actual render pipeline. Apply source peak lag and measured output offset as separate values. Keep both in the timing calculation rather than hand-editing individual hit frames. See [Sound design](references/sound-design.md).

## Render and verify delivery

1. Render the BGM version from the Remotion timeline.
2. Render the no-BGM version from the same timeline with the Remotion BGM prop, such as `{"bgm": false}`. Never make the no-BGM version by removing a track from the finished file with a media command.
3. Normalize the BGM version for the named destination with `loudness.py`. Measure the no-BGM stem and report its peak without applying the platform target.
4. Re-run `scenes.py DELIVERED_NORMALISED_BGM_FILE --beats` on the delivered, loudness-normalised file. Compare every designed cut against the nearest measured beat, and report the error in frames. Do not use the pre-normalised render as the final re-test.
5. Re-measure output offset after the final audio encode. Record the codec and bitrate with the measured offset. Run `check.py DELIVERED_FILE --platform DESTINATION --content` for each delivered file.
6. If any measurement tool is absent, list its check as unchecked. Do not report an unchecked test as passed.

See [LICENSE.md](references/LICENSE.md) for the upstream license and adaptation notice.
