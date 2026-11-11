# trove-broll-ingest run (BuildLoop wave A)

The CP6 check: run the skill on a real raw clip, grade from the probed transfer,
and catalog the selects. The take-cut attempts and the later synthetic retake
run are recorded separately below. No real multi-take recording was available.

## Result

Five graded selects from one raw clip, catalogued in a scratch library. Two
shots were rejected as repeat coverage of a subject already selected. The first
span cut from the opening shot opened on a camera move, so it was re-cut into
the two stretches where the camera holds.

## Source

`assets/video/greenscreen.mp4`, already in the repository. 49.0 seconds,
1280x720, 30 fps, h264 and aac. `probe.py` reads the transfer as bt709, so the
grade is `cinematic-rec709.cube`. `scenes.py` finds six hard cuts, at 0, 8, 19,
29, 37, and 43 seconds.

The library is a scratch directory. The skill refuses to invent a library path,
and nobody named one, so the run pointed `--library` at a temporary directory
instead of writing into the repo.

## Selects

Each was cut with `cut.py --accurate` and graded with `color.py --lut`. The
opening frame of each was extracted and looked at.

| File | Span | What it shows |
|---|---|---|
| detail_tabletop_prints_greenscreen.mp4 | 1.2 to 3.2 | Two instant prints lying in confetti, camera holding |
| detail_tabletop_printer_greenscreen.mp4 | 4.6 to 6.6 | The camera with a print already out, camera holding |
| detail_confetti_fall_greenscreen.mp4 | 8.5 to 18.5 | Confetti falling past a held print |
| detail_party_table_greenscreen.mp4 | 19.5 to 28.5 | Cake, green screen, and birthday card, set from the first frame |
| detail_print_eject_greenscreen.mp4 | 43.5 to 48.5 | A print sliding out of the camera |

## Rejected

The shot from 29 to 37 seconds and the one from 37 to 43 both show the same
instant camera the eject select already covers, so neither was cut. The
selection rules say a second angle of a moment already chosen is not a select.

The opening eight seconds are one continuous pan across three setups. Cutting
0.5 to 7.5 produced a file whose first frame is the blurred move between them,
which the opening-frame check rejects. It was replaced by the two held spans in
the table.

## Shake

`shake.py` scored 20.11 on the pan, 6.35 on the falling confetti, and 1.89 on
the eject. The pan is a deliberate camera move, so the rule says to leave it.
The other two are locked shots whose motion is in the scene, and stabilizing
them would be wrong. Nothing was stabilized. All five catalog entries record
`stabilized: false`.

## The take cut

### Real speech run, 2026-11-10

The user authorized installing `faster-whisper` for this run. It is version
1.2.1 with CTranslate2 4.9.0, in a disposable Python 3.12 environment at
`/tmp/trove-asr`, outside the repository. The model is `small` on CPU at int8.
PyAV in that environment rejects an argument faster-whisper passes it, so the
transcriber reads the audio from ffmpeg as 16 kHz PCM and never opens the file
through PyAV.

The source is `_sample/ffmpeg-skill/site/media/filler_en.mp4`, 11.418 s, 854
by 480 at 24 fps, mono AAC at 48 kHz. Its sha256 matched before and after the
run, so the source was not modified.

**Correction, same day.** This clip is not a multi-take recording. The
sample's own `docs/demos.md` and `demos/pages_videos.py` show it is a
before-and-after demo of `silence.py --filler`, built from AI-generated footage
(`demos/footage/ai_talk_en.mp4`). The first half carries the burned-in label
"BEFORE (er, um left in)". The second half is the same reading after the
fillers were cut, labelled "AFTER silence.py --filler". The labels show in
every frame of the cut. The run therefore exercises the scripts on generated
speech with two copies of each line. It does not show a real session with
retakes, and the "keeper" choice had nothing real to decide. CP6's manual
check on a real multi-take recording is still not met. Of the five clips
inspected, none is a real multi-take session. Three are single readings, one
English and two Japanese, and the 287 s demo was not transcribed.

| Line | Text | Take 1 | Take 2 | Kept |
|---|---|---|---|---|
| 1 | Hey, hello there. | 0.00 to 2.34 s | 6.44 to 8.10 s | take 2 |
| 2 | Well, good morning. | 3.80 to 5.62 s | 9.50 to 11.02 s | take 2 |

`audio.py --mono` wrote a 48 kHz mono 16-bit WAV. The skill says 16 kHz, but
`audio.py` keeps the source rate and `cut_points.py` reads any rate.
`cut_points.py` returned 6.525 to 8.262 s and 9.746 to 11.363 s. The peak
level sits near 0.0014 before each onset and crosses the 0.005 threshold at the
reported edge, so no breath was kept and the opening "h" was not clipped at
20 ms resolution. `cut.py --segments --accurate` with the default 20 ms declick
wrote a 3.375 s file at frame precision. Across the join the largest step
between samples is 0.044, against 0.506 inside speech. `check.py` reported 12
checks, 0 failed, and 3 warnings: 854 by 480 below 720, no subtitle track, and
a true peak of -0.4 dBTP.

The fresh transcript of the cut reads "Hey, uh, hello there. Well, good
morning." The first content check failed with `word 2 has a time range that
does not move forward`. The word was `uh,` at 0.72 to 0.72 s. That failure was
a defect in the earlier verifier fix, which rejected `end == start`, and
recognizers give short fillers a zero-length range. The check now rejects
only a range that runs backwards. A regression test failed before the change
and passes after it. The same transcript then printed `CONTENT: clean (7
words)`.

The keepers were chosen on a transcript that dropped every filler, including
the "er" and "um" the sample documents in the first half. When each reading
was transcribed alone with a filler-laden initial prompt, all four contained
one: "uh" in both readings of line 1 and "um" in both readings of line 2. In
the second half the fillers had already been cut, so the waveform was checked
for a prompt-induced invention. The gap where each filler sat still holds a
burst of about 0.2 s, and for line 2 its 40 ms peak levels (0.505, 0.323,
0.167, 0.075) repeat the tail of the first half's "um" exactly. The cut there
used `--margin 0`, and a fragment of each filler survived it. The second-half
detections are consistent with those fragments. Nobody listened to confirm
them. `takes.json` names the filler in each reason. `verify_cut.py` does not
look for fillers, so `CONTENT: clean` does not mean the cut is fluent. The
skill now says to keep fillers in the transcript, to transcribe each reading
alone, and to route filler removal to `silence.py --filler` only on request.
That tool was not run.

Two steps departed from the skill. The scratch directory was
`/tmp/trove-sync/cp6-take-cut`, not one next to the source, so nothing was
written into `_sample/`. `takes.json` was not shown to the user before the
render. Both readings of each line carry a filler, so a per-line override
would not have changed the result, but the user can still override it.

Evidence is in `dev-doc/media-verification/2026-11-take-cut/`: `takes.json`,
`points.json`, `source.words.json`, `cut.words.json`, `cut.check.txt`, and the
sha256 of the source and of `cut.mp4`. The cut itself is
`/tmp/trove-sync/cp6-take-cut/cut.mp4`.

### Real multi-take recording, 2026-11-11

This is the CP6 acceptance run. The user supplied `multi-take-recording.mov`,
a 24.18 s recording of themselves reading three script lines, with one line
read twice. It is 1080x720 at 29.917 fps, h264, with mono AAC at 44.1 kHz.
The source hash was unchanged after the run. The scratch directory was the
session scratchpad, not one next to the source, so nothing was written beside
the user's file. Only text evidence is kept in the repository. The footage
shows the user, and no frame or media file was copied in.

`faster-whisper` `small` transcribed the whole file with the filler prompt,
then each candidate reading alone. The isolated pass found quiet off-script
speech from 1.4 to 4.8 s that the full pass dropped. It is pre-roll and was
excluded, as was the closing "Okay." at 23.56 s.

`takes.json` was shown to the user before rendering, through the session
dialog, and the user chose the recommended keeper for line 2.

| Line | Readings | Kept | Reason | Cut |
|---|---|---|---|---|
| All 10 corrected evals testing now pass. So the CP2 failures are resolved in the follow-up runs. | 1 | 1 | Only reading; it has a grammar slip | 5.766 to 12.725 s |
| The plan is still not complete. | 2 | 1 | Fluent, followed by a 0.7 s pause. Reading 2 follows a "CP2" false start, hesitates 0.48 s, and runs into the next line | 13.283 to 15.169 s |
| CP6 and CP7 need something I cannot produce. | 1 | 1 | Only reading; it has a flubbed word, "need there" | 19.506 to 22.931 s |

The first cut, with the default threshold of 0.005, passed `verify_cut.py`
but was wrong in two ways. Its fresh transcript opened with "Okay." at 0.00 s.
That was a 0.18 s syllable at 5.28 s, peaking at 0.055, separated from "All"
by 0.3 s of exact zero. And "runs" was missing. After 12.59 s the "s" decays
at 0.002 to 0.004 for about 0.15 s, under the threshold, so the cut stopped
early. The recording is noise-gated: 28.2% of its samples are exactly zero.

The second cut started line 1's window at 5.6 s and passed `--threshold
0.0015`. Line 1 now ends at 12.725 s instead of 12.589 s, and line 3 at
22.931 s instead of 22.900 s. `cut.py --segments --accurate` with the default
20 ms declick wrote a 12.267 s file. Its fresh transcript starts with "All" at
0.00 s, ends line 1 with "run.", and `verify_cut.py` printed
`CONTENT: clean (32 words)`. The recognizer reads the last word as "predict"
at confidence 0.38, where the source passes read "produce". Line 3 in the cut
correlates 0.92 with the source after a 16 ms offset, and its last 80 ms still
carries signal, so the word was not cut off. Nobody listened to confirm it.
`verify_cut.py` does not check fillers or wording, so a clean result here
means no repeated line and an on-time first word.

`check.py --platform youtube --content` failed aspect (3:2) and loudness
(-34.8 LUFS) and warned about digital-silence gaps and the absent subtitle
track. The source itself fails the same two rows (3:2, -34.1 LUFS) and has 26
gap warnings, because of the gate. These are properties of the recording, and
delivery fixes belong to `trove-video-edit` and `trove-ffmpeg`. The contact
sheet shows the speaker in frame across all three joins.

The skill now says that on a quiet or gated recording the default threshold
clips soft word endings, and to lower `--threshold` toward the gate's floor.
Evidence is in `dev-doc/media-verification/2026-11-take-cut-real/`, with the
first cut under `attempt1/`.

### Synthetic retakes, 2026-11-10

The user chose synthetic retakes in the session dialog. Five readings were
created with macOS `say`, Samantha at 155 words per minute, separated by one
second of silence and muxed onto a moving test pattern. The input is 22.291 s,
1280x720 at 24 fps, with mono AAC at 16 kHz. This is synthesized speech, not a
recording of a person. CP6's real multi-take acceptance check stays partially met.

The fixture deliberately includes two false starts. Line 1 has three takes;
its second says "Keep the original, uh, sorry" before restarting. Line 2 has
two takes; its last says "Choose the, um, wrong reading. Sorry" before restarting.
`fixture.json` records the exact input text and generated windows.

`probe.py` inspected the source. `audio.py --mono` extracted a 16 kHz WAV,
and `faster-whisper` small transcribed the whole clip and every reading alone
with the filler prompt used above. The full-file pass omitted line 1's third
reading. The isolated pass recovered it. Both passes found line 2's false
start. This is a concrete reason to retain the per-take transcription step.

The keeper choices were shown to the user before rendering, with no extra
approval requested under their instruction to proceed without more questions.

| Line | Keeper | Reason | Waveform cut |
|---|---|---|---|
| Keep the original recording safe. | 3 of 3 | Last clean reading; take 2 restarts | 9.617 to 11.513 s |
| Choose the cleanest reading for each line. | 1 of 2 | The later reading flubs a word and restarts | 12.729 to 14.820 s |

`cut_points.py` scanned the extracted waveform inside the recorded windows.
`cut.py --segments --accurate` rendered a 4.000 s output with its default
20 ms declick. Its fresh transcript reads exactly the two intended lines,
starting at 0.00 s. `verify_cut.py` printed `CONTENT: clean (12 words)`.
No filler removal was run. The source hash is unchanged after the cut.

`check.py --platform youtube --content` reported 19 checks, one failure and
two warnings. Loudness was -16.2 LUFS, outside the -14 ± 2 LUFS delivery target.
True peak was -2.8 dBTP. The warnings are 16 kHz audio and no subtitle track.
Content checks found no black frames, freezes, flashes, silence, or dropouts.
The contact sheet shows the moving test pattern across the cut. No person
listened to establish natural delivery or the absence of audible clicks.
The output was not normalized, because this is a take-cut acceptance fixture.

Text evidence, including every isolated transcript, is in
`dev-doc/media-verification/2026-11-take-cut-synthetic/`. The source, extracted
WAV, cut, and contact sheet are in `/tmp/trove-sync/cp6-synthetic/`. The fixture
builder and transcriber are `/tmp/trove-asr/make_retakes.py` and
`/tmp/trove-asr/transcribe_retakes.py`. No media binary was added to the repo.

### Earlier attempts

Before that run, no suitable recording or working word-level transcription
engine had been found among the inspected project samples and installed tools.

A Swift Speech probe timed out. A subsequent authorization request exited 137
with `__TCC_CRASHING_DUE_TO_PRIVACY_VIOLATION__`. That establishes a failed
probe, not that command-line speech recognition is impossible.

A separate synthetic waveform test used 15 seconds of black video with six
sine-wave bursts, arranged as four candidate windows. Two windows contain an
internal gap and two contain continuous tones. There is no speech in this file.
The JSON word labels and timestamps were invented test inputs, not a transcript.

`cut_points.py` returned 4.500 to 6.600 and 11.500 to 13.600 from the supplied
keeper windows. `cut.py --segments --accurate` assembled those spans into a
4.200 second file. Thresholding the decoded audio at 200 PCM units and merging
runs separated by less than 0.1 seconds produced one run from 0.000 to 4.200.
This tests waveform boundaries and assembly, not speech recognition, take
selection, intelligibility, or the absence of shorter gaps and clicks.

`verify_cut.py` returned `CONTENT: clean (4 words)` for a hand-written JSON
fixture. It reads JSON only and did not inspect the rendered audio. This is not
an independent content verification of the output.

Selecting the gapped windows produced detected runs of 0.000 to 0.700,
1.400 to 2.800, and 3.500 to 4.200. The earlier claim that these pauses prove a
checker defect was incorrect. The skill explicitly preserves pauses inside kept
lines. The checker tests leading word time and repeated phrases of at least
three words; it does not judge delivery. No negative content-check result was
obtained from this tone experiment.

## Script fixes after review

A later review found input cases the runs above never exercised. Each fix has
a test in `tests/trove-media-scripts.test.ts` that failed on the old code and
passes now. The tests build their own WAV and JSON inputs, so they check the
scripts' arithmetic and refusals, not speech.

- `cut_points.py` turned a one-sample pulse into a cut that starts and ends on
  the same millisecond. It now holds the offset open by one sample, rounds the
  onset down and the offset up, and keeps a span with duration.
- `cut_points.py` rejected two disjoint keepers as an overlap when line 1 was
  retaken after line 2. It now compares keepers in source order and keeps the
  output in script order. Two keepers covering the same audio still fail.
- `verify_cut.py` now fails a word whose range runs backwards, or whose start
  is negative. A zero-length word passes, as the real speech run above requires.
- `catalog.py` now refuses an empty file, source, category, or description, a
  negative start, an end that does not follow the start, and a non-finite
  span. It writes nothing when it refuses. A select already catalogued under
  another spelling, such as `./selects/../selects/a.mp4` for `selects/a.mp4`,
  is now a duplicate.

The synthetic tone run above used the old rounding. It was not repeated, so its
millisecond edges may differ by up to one millisecond under the new code.

## Not checked

`eval:changed` produced no scores. A later SDK probe on the configured judge
endpoint returned HTTP 429, `retry-after: 10853`, and
`anthropic-ratelimit-unified-5h-reset: 1794306600`. That reset timestamp is
2026-11-10 05:30 EST in America/Toronto. It is a server-advertised reset, not a
guarantee the next run will succeed. Earlier notes incorrectly named November
11 and inferred expired credentials from requests sent to a different endpoint.
The runner now disables SDK retries and exits on the first 429.

The later full new-model baseline covered both suites. `trove-take-cut` scored
8.8, 8.7, 9.2, and 8.3; `trove-broll-ingest` scored 8.8, 9.2, 9.2, and 8.5.
All eight tasks passed on `claude-sonnet-5-5` at effort `high`. The rows are in
`dev-doc/model-refresh/2026-11-judge-baseline.tsv`. These judgments estimate
responses from the skill text; they do not supply the missing real speech run
or fresh transcript.
