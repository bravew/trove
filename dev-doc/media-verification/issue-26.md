# trove-ffmpeg smoke run (issue #26)

Release gate for `trove-ffmpeg`: probe a real clip, cut it, and run
`check.py --platform youtube` on the output, using the installed skill.

## Result

The gate passed. Every script exited as expected, and the delivery check passed
on the final file. No skill defect was found.

One check failed on the first cut and was fixed with the script the check
names. That failure came from the input clip's quiet audio, not from the skill.

## Environment

| Item | Value |
|---|---|
| Date | 2026-10-07 |
| Branch | `test/media-smoke-26` at `6b66fb9` (`origin/epic/media-wave1` after #49) |
| Vendored upstream | `kajisho5/ffmpeg-skill` at `008333a` (2.5.1), per `upstream.yaml` |
| ffmpeg / ffprobe | 9.0.2 (Homebrew, `/opt/homebrew/bin`) |
| python3 | 3.14.8 |
| OS | macOS 27.0.1 (26A434), arm64 |

## Install

The Claude bundle was installed into a disposable `HOME` with a `claude` stub
that reports no marketplace support, so the installer took the symlink path, as
`tests/acceptance/setup-links.sh` does.

```
HOME=<tmp>/home PATH=<tmp>/bin:$PATH ./setup --host claude --role all
```

Result: `61 skill(s) linked into ~/.claude/skills/`. `trove-ffmpeg` resolved to
`plugins/trove-media/skills/trove-ffmpeg` in this checkout. Every command below
ran from `<tmp>/home/.claude/skills/trove-ffmpeg/scripts/`.

## Input clip

`assets/video/greenscreen.mp4`, supplied by the maintainer and not committed.

- sha256 `438401fc3a1a9af59e7e7065e843af9f947bb332911b6873adf2b59b15914638`
- 9,739,276 bytes

## Commands and measured values

### 1. Probe

```
probe.py greenscreen.mp4
```

Exit 0. The values matched an independent `ffprobe` run.

| Field | Value |
|---|---|
| Duration | 49.001667 s |
| Video | h264 High, 1280x720, 16:9, yuv420p, 8-bit |
| Frame rate | 30 fps, constant (`variable_frame_rate_suspected: false`), 1470 frames |
| Colour | bt709 / bt709 / bt709, tv range, not HDR, rotation 0 |
| Audio | aac, 2 channels (stereo), 48000 Hz |
| Subtitles, chapters | none |

### 2. Cut

```
cut.py greenscreen.mp4 --start 5 --end 20 -o cut.mp4
```

Exit 0. The stream copy landed on a keyframe 2.10 s from the requested start,
over the 0.5 s tolerance, so the script re-encoded the segment on its own
(x264 CRF 18, aac 192k) and said so on stderr. It also named the nearest
keyframe start for a lossless cut (6.067 s).

- Output `cut.mp4`, 15.021 s (requested 15.000 s), 3,378,386 bytes
- sha256 `838f323187a1a83ad249986a681531ee5ecc7bd6567fe0c0b8a5c7b16386c9dd`

### 3. Check, first pass

```
check.py cut.mp4 --platform youtube --json
```

Exit 1, `1 of 12 youtube checks failed: loudness`.

| Check | Status | Value |
|---|---|---|
| duration | PASS | 15.02s |
| aspect | PASS | 16:9 |
| resolution | PASS | 1280x720 |
| fps | PASS | 30 |
| vfr | PASS | constant |
| video codec | PASS | h264 |
| colour | PASS | bt709/bt709 |
| file size | PASS | 3.2 MB |
| audio | PASS | aac 2ch 48000Hz |
| subtitles | WARN | none |
| loudness | FAIL | -30.6 LUFS (expected -14 +/- 2) |
| true peak | PASS | -9.9 dBTP |

The failure is correct. The source audio is quiet, and the check names
`loudness.py -I -14` as the fix.

### 4. Loudness fix

```
loudness.py cut.mp4 -I -14 --tp -1 -o cut_loud.mp4
```

Exit 0. Result `-15.8 LUFS, TP -1.2 dBTP`. The script re-encoded the audio
twice, first at 320k and then with the ceiling lowered to -1.59 dBTP, because
the AAC encode overshot the -1 dBTP limit. It reported both steps on stderr.

- Output `cut_loud.mp4`, 15.10 s, 3,457,146 bytes
- sha256 `e78cfe654dcab10923c645277b353c0f0ac00fbdde7ca75bb12caec9f43b043b`

### 5. Check, final file

```
check.py cut_loud.mp4 --platform youtube --json
```

Exit 0, status `completed`, 0 failed, 1 warning.

| Check | Status | Value |
|---|---|---|
| duration | PASS | 15.10s |
| aspect | PASS | 16:9 |
| resolution | PASS | 1280x720 |
| fps | PASS | 30 |
| vfr | PASS | constant |
| video codec | PASS | h264 |
| colour | PASS | bt709/bt709 |
| file size | PASS | 3.3 MB |
| audio | PASS | aac 2ch 48000Hz |
| subtitles | WARN | none |
| loudness | PASS | -15.8 LUFS |
| true peak | PASS | -1.2 dBTP |

## Skipped and not established

- Only `probe.py`, `cut.py`, `check.py`, and `loudness.py` ran. The other 38
  tools were not exercised here.
- The subtitles WARN stays. The check calls subtitles optional, and the run did
  not add a track.
- One clip, one platform (`youtube`), one machine. This does not cover other
  ffmpeg builds, other platforms' specs, or Linux.
- The first-pass loudness FAIL is a finding about the clip. No bug is filed
  under Epic 2.

## Artifacts

Outputs stayed in a temporary directory outside the repository, and no media
binary is committed. The sha256 values above identify them.
