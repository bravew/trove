# Issue #34 smoke render

Date: 2026-10-07

## Result

The template renders successfully with a non-default theme, but this checkout does not implement the requested BGM/no-BGM pair. `src/aifl/Main.tsx` contains SFX only, and `AiflPromo` has no `bgm` input prop. The original and `bgm: false` renders therefore contain the same SFX track. Both rendered files and the normalized delivery are outside Git under `/tmp`.

This is a partial smoke result. It verifies the theme render, SFX-only export, normalization and delivery checks. It does not verify a BGM mix, BGM removal through a Remotion prop, or music beat-to-cut error. No BGM asset was copied into the template or added to the composition.

## Environment

- Source checkout: `video-shotcraft` at `5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab`
- Template: `template/`
- Node.js: v22.20.0
- npm: 10.9.3
- Remotion packages: 4.0.484, all versions matched
- Browser: Remotion Chrome Headless Shell, Google Chrome for Testing 153.0.8010.12
- ffmpeg / ffprobe: 9.0.2
- Python: 3.14.8
- Platform: macOS arm64
- Dependencies: installed from the committed `package-lock.json` with `npm ci`
- `npm ci` reported 7 audit findings: 3 moderate and 4 high

## Commands and artifacts

Rendered with the non-default `coral-burst` palette and the template's documented override colors (`accent: #2459ad`, `surface: #e1ecff`). Props files and outputs are temporary and were not committed.

| Purpose | Command | Artifact |
| --- | --- | --- |
| Composition discovery | `npx remotion compositions src/index.ts` | `AiflPromo`, 1920×1080, 30 fps, 1085 frames |
| Main render | `npx remotion render src/index.ts AiflPromo /tmp/shotcraft-34-bgm.mp4 --props=/tmp/trove-smoke-34-coral.json` | `/tmp/shotcraft-34-bgm.mp4` |
| Attempted no-BGM prop render | `npx remotion render src/index.ts AiflPromo /tmp/shotcraft-34-nobgm.mp4 --props=/tmp/trove-smoke-34-nobgm.json` | `/tmp/shotcraft-34-nobgm.mp4` |
| YouTube normalization | `loudness.py /tmp/shotcraft-34-bgm.mp4 -I -14 --tp -1 -o /tmp/shotcraft-34-bgm-normalized.mp4` | `/tmp/shotcraft-34-bgm-normalized.mp4` |
| Visual samples | `look.py ... --at 3 --at 10 --at 18 --at 31 --at 34 --no-timecode` | `/tmp/shotcraft-34-review_*.png`, `/tmp/shotcraft-34-normalized-review_*.png` |

The no-BGM render supplied `{"bgm":false}`, but the composition does not read that prop. Audio decoded from the two renders had a measured cross-correlation of 1.000 at zero lag, confirming that their audio is identical.

## Measurements

| File | Duration | Video | Audio | Size | Loudness | YouTube content check |
| --- | ---: | --- | --- | ---: | --- | --- |
| SFX-only render | 36.224 s | H.264, 1920×1080, 30 fps | AAC, stereo, 48 kHz | 17,164,015 bytes | −20.74 LUFS, −2.21 dBTP, LRA 13.60 LU | 1 failure: loudness; 1 warning: no subtitles |
| Normalized SFX-only delivery | 36.300 s | H.264 stream copied, same 1085 frames | AAC, stereo, 48 kHz, 320 kbit/s | 16,683,374 bytes | −14.96 LUFS, −1.38 dBTP, LRA 8.70 LU | 0 failures; 1 warning: no subtitles |
| `bgm: false` prop render | 36.224 s | H.264, 1920×1080, 30 fps | AAC, stereo, 48 kHz | 17,174,306 bytes | −20.74 LUFS, −2.21 dBTP, LRA 13.60 LU | 0 format/content failures when loudness is excluded; 1 warning: no subtitles. Full check fails loudness. |

The normalizer re-encoded audio at 320 kbit/s and lowered the internal true-peak target to −1.54 dBTP to account for AAC codec overshoot. The final measurement is −14.96 LUFS and −1.38 dBTP, within YouTube's configured tolerances. A 12 kHz mono PCM cross-correlation of the original and normalized audio measured a zero-sample peak lag (0.000 s) at 10 ms search resolution. Container duration increased by 0.076 s due to audio encoding and muxing; the video stream was stream-copied. Comparing all 1085 video frames produced infinite PSNR, so normalization did not change the video frames.

`scenes.py --beats` on the normalized output measured 88.24 BPM, phase 0.51 s, confidence 0.257, with 45 supported grid points out of 53. It reported `usable: false` against the 0.5 confidence threshold. The beat check is not evidence of music sync: this output contains SFX only. Designed music cut error remains unmeasured because there is no BGM input or accepted beat grid in the rendered template.

## Visual review

Extracted frames at 3, 10, 18, 31, and 34 seconds from the render and normalized output. The opening page, card flight, detail screen, title card, and outro are present. The coral-burst palette and supplied surface/accent overrides are visible. No frame extraction or encoding errors occurred. The rendered demo includes Chinese interface text from the fixture assets.

## Failures and outstanding work

- The required BGM and no-BGM variants cannot be produced from this template: the registered composition is SFX-only and has no `bgm` prop. Both attempted renders are audio-identical.
- The SFX-only original fails YouTube loudness at −20.74 LUFS. The normalized SFX-only file passes at −14.96 LUFS and −1.38 dBTP.
- Beat-grid confidence is below threshold (`usable: false`). Music beat-to-cut error was not measured.
- Audio offset change after normalization measured 0.000 s; only the container duration changed (+0.076 s). The video frames remained identical.
- The template's `look.py` timecode option failed because the installed ffmpeg lacks the `drawtext` filter. Re-running with `--no-timecode` succeeded.
- No separate bug issue was opened because the BGM gap is in the upstream smoke fixture itself; this report records it for triage.

The BGM-specific acceptance items remain incomplete. A follow-up needs an authorized, pinned BGM input and a template/composition that exposes and honors the BGM prop before the two-version audio and synchronization checks can pass.
