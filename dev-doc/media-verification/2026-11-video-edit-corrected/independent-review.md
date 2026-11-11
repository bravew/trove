# Independent review of corrected Intro and Shorts

Verdict: **not certified.** The previously required colour, caption-timing, Shorts safe-area, and long-silence-tail corrections are met on the files measured here. Certification is still blocked because the brief, storyboard, brand direction, music, sound effects, and data-use policy were not supplied, so P, F, V, S, most of B, D, and most of A stay unchecked. Missing inputs are not treated as passes.

This reviewer did not produce these videos. The earlier review at `/tmp/trove-sync/cp7-review/review.md` was read only as context for which defects had been named. Every measurement below was taken again on the corrected files. No video and no repository file was modified. Evidence is under `/tmp/trove-sync/cp7-corrected-review/`.

## Inputs

Reviewed:

- Intro: `/tmp/trove-sync/cp7/corrected/final_intro.mp4`
- Shorts: `/tmp/trove-sync/cp7/corrected/final_shorts.mp4`
- Plans: `plan_intro.json` and `plan_shorts.json` in `/Volumes/4TB_WD/dev/bravew/trove/dev-doc/media-verification/2026-11-video-edit-corrected/`
- Producer probes in that same directory, used as claims to re-check, not as this review's measurements
- Source: `/Volumes/4TB_WD/dev/bravew/trove/_sample/ffmpeg-skill/demos/footage/ai_talk_en.mp4`

Not supplied, and therefore unchecked: product brief, audience, positioning, required features, storyboard, shot references, brand tokens, forbidden styles, audio plan, music, sound effects, asset-rights records, and a data-use policy. The plans name `talk_intro.mp4` and `talk_shorts.mp4`; those intermediates were not supplied. `hashes.sha256` also names preview files that were not in the review set.

SHA-256 of the bytes reviewed (`hashes.txt`):

- Intro `2ba26582b3b6b426f32975fa8c313f64d213d79326c21498bbf74b8eda7610f3` (5,746,445 bytes), matching the supplied hash line for `final_intro.mp4`
- Shorts `a79f768f786fb8177c02f4cbbf354e34cef84a26c1709932b604e200bfa28332` (6,863,862 bytes), matching the supplied hash line for `final_shorts.mp4`
- Source `4a06601f7b0639a9f8fbdef7cacd5051b43a849434a0e37157b7c82c3befab88`

## How frames were counted

Both exports are constant 24 fps, 240 frames, f0 through f239. Frame N starts at N/24 seconds and the next frame starts at (N+1)/24. Video duration is 10.000 s; the container and AAC stream run to 10.005 s. The source is 24 fps, 361 frames, 15.041667 s, audio 15.018 s.

`look.py --at hh:mm:ss:ff` was run for the caption boundaries. This ffmpeg build has no drawtext, so those stills have no burned timecode; the filenames record the seek time look.py used, rounded to milliseconds. Decisive on/off evidence is exact decoded frames (`select=eq(n\,N)`) in `native/`, inspected as caption crops. Contact sheets `intro_sheet.png` and `shorts_sheet.png` are 12 tiles, left to right, top to bottom, about every 0.83 s from 0.42 s. They show state, not exact boundaries. No listening pass was available.

## Measurements

| | Intro | Shorts | Source |
|---|---|---|---|
| Raster | 1920×1080, 16:9, square pixels | 1080×1920, 9:16 | 854×480, 16:9 |
| Codec | H.264 High, yuv420p, 8-bit, TV range | same | same, TV range |
| Colour tags | bt709 matrix, primaries, and transfer, on the stream and on frame 0 | same | same |
| Audio | AAC stereo 48 kHz, 0 to 10.005 s | same | AAC mono 48 kHz, 15.018 s |
| Integrated / true peak / LRA | −13.03 LUFS / −3.01 dBTP / 1.30 LU | −13.09 LUFS / −3.18 dBTP / 1.30 LU | −13.01 LUFS / **+2.42 dBTP** / 2.10 LU |
| `check.py --content` | 0 fail, 1 warn (no subtitle stream). Black 0%, longest freeze 0.0 s, 0 flashes, 0 dropouts, silence 35% | same shape; silence 34% | not a delivery |

Evidence: `probe_intro.json`, `probe_shorts.json`, `probe_source.json`, `frame0_intro.txt`, `frame0_shorts.txt`, `loudness_intro.json`, `loudness_shorts.json`, `loudness_source.json`, `check_intro.json`, `check_shorts.json`. The loudness band (−14 ±2 LUFS) and true-peak ceiling (−1 dBTP) are the tool's platform defaults. No separate delivery contract was supplied.

The supplied producer probes agree with these measurements (colour bt709/bt709/bt709/tv, −13.03 / −13.09 LUFS, −3.01 / −3.18 dBTP, 240 frames). They were not used in place of a fresh probe.

### Caption timing against the plans and the waveform

Both plans schedule the same three captions, each with a reading tail past the speech:

| Line | Plan | Speech above −50 dBFS, 20 ms RMS, both finals | Glyphs present | Glyphs absent |
|---|---|---|---|---|
| Hey, hello there. | 0.52–2.68 s | 0.52–1.58 and 1.76–2.48 (gap 1.58–1.76) | f12 (0.500 s) through f63 (2.625 s) | f11 (0.458 s); f64 (2.667 s) and f65 |
| Well, good morning. | 3.98–6.10 s | 3.98–4.96 and 5.10–5.90 | f96 (4.000 s) through f146 (6.083 s) | f95 (3.958 s); f147 (6.125 s) |
| Hope you're having a good day. | 7.58–9.50 s | 7.58–9.30 | f182 (7.583 s) through f227 (9.458 s) | f181 (7.542 s); f228 (9.500 s) |

At 24 fps a caption that starts at time T is first visible on the first frame whose start is at or after T, and a caption whose plan end is E is last visible on the last frame that starts before E. The observed intervals are exactly those frame windows:

- 0.52 s falls inside f12 [0.500, 0.542); 2.68 s falls inside f64, so the line must be gone by f64. It is.
- 3.98 s falls inside f95 [3.958, 4.000); the line is off at f95 and on at f96. 6.10 s falls inside f146, so the line must be gone by f147. It is.
- 7.58 s falls inside f181 [7.542, 7.583); the line is off at f181 and on at f182. 9.50 s is exactly the start of f228, so the line must be gone at f228. It is.

The rendered strings, read from native crops, are "Hey, hello there.", "Well, good morning.", and "Hope you're having a good day." They match the plan text, including the comma and the apostrophe. Intro holds are about 2.17 s, 2.13 s, and 1.92 s. Shorts uses the same times; lines 1 and 2 are two lines and line 3 is three. Evidence: `envelopes.json`, `silence_intro.json`, `silencedetect_intro.log`, crops `intro_f012_cap.png`, `intro_f036_cap.png`, `intro_f064_cap.png`, `intro_f120_cap.png`, `intro_f204_cap.png`, `intro_f228_cap.png`, and the matching Shorts crops and `shorts_f182_cap.png`.

The −50 dBFS speech groups on both finals are 0.52–2.48, 3.98–5.90, and 7.58–9.30 s, allowing the short dip inside the first and second phrases (1.58–1.76 and 4.96–5.10). That matches the groups named for this review. `silencedetect` at −50 dBFS, minimum 0.2 s, reports the same phrase gaps (end 0.525542, 2.495771–3.981187, 6.125563–7.566458) and does not report those intra-phrase dips because they are shorter than 0.2 s. The source has the same three groups (0.52–2.48, 3.98–5.90, 7.56–9.30). This is an energy envelope, not a phoneme alignment. Word-internal boundaries were not verified by listening.

### Shorts caption bottom

The tool's Shorts UI exclusion is top 6%, bottom 18%, left 5%, right 12% (`_platforms.py`). On 1080×1920 that bottom band begins at y1574.4. Glyph edges (near-white pixel with a dark neighbour, so the white shirt is not counted):

| Caption | Bottom glyph row | Left / right | Against y1574 and side guides |
|---|---|---|---|
| Hey, hello there. (f12, f36) | y1520 | x410–577 | 54 px above the band; inside x54 and x950 |
| Well, good morning. (f96, f120) | y1520 | x401–544 | same |
| Hope you're having a good day. (f182, f204, f227) | y1533 | x385–559 | 41 px above the band; inside both side guides |

`ssafe_1.500s.png` and `ssafe_8.500s.png` show the same lines entirely above the shaded bottom band. The right-edge guide does not cut the longest line. This is the tool's guide, not a capture of the live YouTube Shorts interface.

### Silence tail

On Intro, `silencedetect` at −50 dBFS reports a last closed quiet span of 9.627083–9.835958 s (0.209 s) and no silence start after that. The 20 ms envelope stays below −50 dBFS from 9.30 s through the end of the measured 10.2 s window, with 100 ms peaks near −68 dBFS at 9.5 s. There is no multi-second dead tail. The source's own tail is different: silence from 9.862292 s through 15.018 s, about 5.16 s, which the corrected exports do not contain. Video ends at 10.000 s and audio at 10.005 s, so the picture does not run on past the audio. f239 (9.958 s) has no caption (`intro_f228` is already blank at 9.500 s; the contact sheet's last tile is the speaker with no type). Shorts matches Intro's envelope to the reported precision.

`check.py` still calls 35% and 34% of each file silent. That is the share below −50 dBFS, and it is under the tool's 50% warn line. The between-phrase gaps (about 1.49 s and 1.44 s) are part of that share. They line up with the planned caption gaps and are not a tail defect.

### Source-relative sync

`sync.py` (8 kHz envelope correlation, 1 ms refine, 10 s analyze, ±2 s search) reports offset 0.000 s for both finals against the source. Confidence is 0.563 and 0.561. The tool's own meaning string is that the second file starts with the reference. Confidence is only moderate, so it is not used alone.

Two other measurements agree:

- Speech-group edges match the source within one 20 ms bin (Shorts and Intro identical to each other; source third-group onset 7.56 vs 7.58 at −50 dBFS, identical at −45 dBFS).
- Picture, caption region excluded (top 45%), downscaled and compared as luma SAD over f10–f229: lag 0 is the minimum for both. Intro lags −3..+3 score 6816, 6270, 5759, **5477**, 5866, 6468, 7082. Shorts scores 11814, 9619, 7217, **5441**, 7217, 9610, 11786. A one-frame shift is clearly worse.

Source true peak is +2.42 dBTP and the finals are −3.01 / −3.18 dBTP, so the audio was re-encoded and lowered, not copied. That level change is why correlation confidence is not near 1. Zero lag plus matching phrase edges is the sync finding. Lip sync of the source itself was not judged; the tools do not measure mouth movement, and there was no listening pass.

Downscaling Intro to the source raster and comparing the upper third (f36, f120, f204) gives a stable mean-luma drop of about 2.4 (62.8→60.5, 63.0→60.6, 65.4→63.0) with no clipped whites. That is consistent with a tagged BT.709 TV-range re-encode rather than a wrong-matrix blowout. It is not a calibrated colour grade.

## P. Plan and product consistency

- **P1 unchecked.** No brief, audience, or positioning was supplied.
- **P2 unchecked.** No required benefit or approved claim list was supplied. The frames show a greeting, not a product demonstration (sheet tile at about 1.2 s, f36, f120).
- **P3 unchecked.** No approved decision record covers storyboard, page state, or audio. Caption-plan execution is under B1 only.

## F. Feature coverage

- **F1 unchecked.** No required-feature list or feature-to-shot map.
- **F2 unchecked.** The three greeting lines are distinct and appear once each (f36, f120, f204). Nothing says whether the closing shot without a caption is redundant.
- **F3 unchecked.** No product page or required page state.

## V. Visual direction

- **V1 unchecked.** No brand tokens, palette, type spec, or forbidden styles. Readability is under Q, not here.
- **V2 unchecked.** No approved motion, hold, or energy curve. The plans give caption times only.

## S. Shot fidelity

- **S1 unchecked.** No storyboard, reference assignment, card, or variant.
- **S2 unchecked.** No reference implementation or motion sample to compare easing, timing, or masks against.

## B. Storyboard consistency

- **B1 pass, caption plans only.** Both files show the three planned strings in order. On/off frames match the plan times to the frame, as in the table above. Evidence: native crops at f12, f36, f64, f95/f96, f120, f146/f147, f181/f182, f204, f227/f228.
- **B2 unchecked.** No transcript was in this review set, so there is no second timing document to conflict with the plans. The waveform agrees with the plan's speech anchors (0.52, 3.98, 7.58) and the captions extend past speech only inside the planned reading tails (through 2.68, 6.10, and 9.50). That is plan execution, not an independent transcript check.
- **B3 unchecked.** No storyboard for shot order, duration, action, page state, transitions, or sound effects. One continuous speaker shot is what the contact sheets show; whether that was the plan is unknown.
- **B4 unchecked.** Intermediates `talk_intro.mp4` and `talk_shorts.mp4` were not supplied. Source picture and audio correspondence is under A7 and Q8. That does not identify the missing intermediates.
- **B5 unchecked.** No planned wordmark or batch-motion ending. None is visible at f228 or f239. Applicability is unknown, so this is not a failure and not a pass.

## D. Data and asset safety

- **D1 unchecked.** No data-use policy and no explicit demo-data authorization. The source path is labelled AI-generated footage; that label is not a rights grant.
- **D2 unchecked as a clearance.** Inspected frames (sheets, f36, f120, f204, f239, caption crops) show a speaker, clothing, a stone wall, and the three greeting lines. No credential, address, or customer record was identified in those frames. This is not an all-frame data review, and there is no masking record. No values are copied here.
- **D3 unchecked.** No product screenshots to compare.
- **D4 unchecked.** Captions are complete in the inspected states. No page-loading record exists for the rest of the criterion.
- **D5 unchecked.** No footage, font, image, or likeness provenance. No unlicensed-asset finding is made.

The source container comment is a long opaque signature. It was not copied into this report. The finals' only comment is "Made with Remotion 4.0.542".

## A. Audio and synchronization

- **A1 unchecked.** No music and no music direction. Absence of music is not treated as an approved decision.
- **A2 unchecked.** No listening pass, stems, or mix plan. Loudness numbers do not prove intelligibility.
- **A3 unchecked.** No sound-effect cue sheet.
- **A4 unchecked.** No beat grid or measured baseline.
- **A5 pass, against the measured tail only.** The corrected files do not contain the source's roughly 5.16 s silent ending. After the last speech group (ends 9.30 s) the picture continues about 0.70 s, to 10.000 s, with audio to 10.005 s and no caption from f228. Whether that last 0.70 s is the intended button is still unknown without an ending spec; it is not the long dead hold called out before. Evidence: `silencedetect_intro.log`, `envelopes.json`, f228 and f239.
- **A6a pass.** Intro −13.03 LUFS, −3.01 dBTP, LRA 1.30. Shorts −13.09 LUFS, −3.18 dBTP, LRA 1.30. Both sit inside −14 ±2 LUFS and under the −1 dBTP ceiling. No clipping on the deliveries. The source itself peaks at +2.42 dBTP; the exports are not that hot. Evidence: `loudness_intro.json`, `loudness_shorts.json`.
- **A6b pass, at the tool's silence rule.** 35% and 34% below −50 dBFS, both under the 50% warn threshold. The long tail is gone (A5). The remaining silence is the lead-in (0–0.526 s) and the two planned between-phrase gaps. Evidence: `check_intro.json`, `check_shorts.json`, `silence_intro.json`.
- **A6c pass for digital dropouts only.** Both content checks report 0 dropouts. Sound-effect audibility is unchecked because no effects were supplied and nothing was listened to.
- **A7 pass, source-relative timing only.** Audio offset 0 ms (`sync_intro.json`, `sync_shorts.json`). Phrase edges match within 20 ms. Picture lag 0 beats ±1 frame on the caption-free top band (scores above). Streams both start at 0; audio outlasts video by 5 ms, well under one frame. Intrinsic lip sync of the generated speaker is unchecked.
- **A8 unchecked.** No BGM and no-BGM pair from one timeline. Intro and Shorts are different pictures and are not that pair. No audio plan says music is out of scope.
- **A9 unchecked.** No bespoke loudness, channel, or ending specification beyond the platform defaults used above.
- **A10 unchecked.** No sound-effect inventory, license, author, or published credit. No violation is alleged.

## Q. Technical image quality

- **Q1 pass.** Intro 1920×1080, Shorts 1080×1920, both square-pixel H.264 8-bit 4:2:0, constant 24 fps, AAC 48 kHz stereo. Evidence: both probes and both check files.
- **Q2 pass, signalling.** Both deliveries tag matrix, primaries, and transfer as bt709, range TV (`tv` / limited), pixel format yuv420p. Frame 0 carries the same three tags. The source is the same signalling. `check.py --platform youtube` and `--platform shorts` both PASS colour. A 2.4-count mean-luma drop after downscaling three Intro frames is small and stable, with no clipped whites, which argues against a mis-tagged full-range or wrong-matrix encode. A calibrated grade was not done, so colour fidelity beyond tags and that luma check is unchecked. Evidence: probes, `frame0_intro.txt`, `frame0_shorts.txt`, `levels/`.
- **Q3 pass, inspected caption states.** All three strings are complete and readable at native size on Intro (f36, f120, f204 crops) and on Shorts (f36, f120, f204, and the safe-area stills). Holds are about 2.17, 2.13, and 1.92 s for 3, 3, and 6 words. Shorts wraps to 2, 2, and 3 lines. The white shirt reduces local contrast; the type still reads in the opened crops.
- **Q4 pass, against the tool guide.** Shorts glyph bottoms are y1520, y1520, and y1533, all above y1574.4, with 41 px or more of margin. Side extents x385–577 sit inside x54 and x950. Evidence: glyph table and `ssafe_1.500s.png`, `ssafe_5.000s.png`, `ssafe_8.500s.png`. A live YouTube Shorts overlay was not captured, so device chrome beyond this guide is unchecked.
- **Q5 pass, sampled framing only.** The Shorts sheet and the safe-area stills keep hair, eyes, mouth, and upper torso inside the frame. The centre crop cuts the outer shoulders and most of the hand gestures, which is what a 9:16 crop of this 16:9 shot does. Every frame was not inspected. No storyboard says the hands must remain.
- **Q6 quality limit, not a failed requirement.** The source is 854×480. Shorts keeps a centre 270×480 crop and scales it 4× to 1080×1920. Hair, beard, and cloth are soft next to the sharper type (`ssafe_1.500s.png`). Intro is scaled about 2.25× from 854×480 and is less soft. No sharpness specification was supplied, so this is not scored as a miss. It is the same source limit as before. Raising the export bitrate will not invent the missing detail.
- **Q7 pass, detector scope.** 0% black, longest freeze 0.0 s, 0 single-frame flashes, first frame not flat (Intro luma spread 38.9, Shorts 46.3). Evidence: both check files. This is not a playback review.
- **Q8 pass, correspondence only.** Top-band luma matches the source (centre-cropped for Shorts) best at lag 0 across f10–f229. This is not pixel identity and not a colour calibration.
- **Q9 unchecked.** No layout, mask, or transition reference, and no continuous playback. Sampled caption edges are clean (on at one frame, off at the next) but that does not cover the whole criterion.
- **Q10 unchecked.** One render per format. No project, repeat render, or preview file was in the review set, so preview-to-final identity was not checked. The hash file names previews; they were not opened.
- **Q11 unchecked.** Both files have zero subtitle streams, which `check.py` warns about and calls optional. Burned-in captions exist. No accessibility requirement was supplied, so the warning is not a required failure.

## Required fixes

None on the criteria that could be measured. Colour tags, caption on/off frames, Shorts caption bottom, loudness and true peak, the silence tail, and source-relative sync all meet the standards stated above.

## Suggested improvements

1. Shorts is a 4× enlargement of a 270×480 crop. If native-size detail matters, use a larger source or a layout that does not scale that crop so far. No sharpness contract was supplied (Q6).
2. Add a language-tagged subtitle stream if a later delivery spec wants selectable captions. Both files currently warn on that optional row (Q11).

## Unchecked items, and what would resolve them

1. **P and F.** Brief, audience, positioning, required benefits, approved claims, feature-to-shot map.
2. **V and S.** Brand direction, forbidden styles, selected shot references, and the original motion samples.
3. **B3, B4, B5, Q10.** Storyboard, ending spec, the missing `talk_intro.mp4` and `talk_shorts.mp4`, the named preview files, the project, and a second render.
4. **D.** Data-use policy, demo-data approval, footage/font/likeness rights, and a full-frame data pass if a clearance is required.
5. **A1–A4, A6c sound effects, A8, A9, A10.** Audio plan, music pair or a statement that music is out of scope, effects inventory with source and license, and a listening pass.
6. **A7 intrinsic sync and B2.** A listening pass or a validated phoneme alignment. Source-relative offset was measured; mouth sync was not. No transcript was in this set.
7. **Q2 fidelity, Q4 live UI, Q5 every frame, Q9.** A calibrated display check, a real YouTube Shorts overlay, and playback of the whole timeline.

These gaps are why the files are not certified. The measured corrections do not stand in for the missing brief, storyboard, and data-use policy.
