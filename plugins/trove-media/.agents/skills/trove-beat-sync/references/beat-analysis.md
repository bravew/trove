# Beat analysis

## Acceptance gate

The upstream grid gate requires at least 98 percent of grid beats to match measured transients, mean absolute error below 5 ms, every residual within 33 ms, and at least 90 percent within 15 ms. Check half-time, normal-time, and double-time candidates. A result that lacks the per-beat residuals needed for these checks has not passed the gate, even if its `usable` field is true.

`scenes.py --beats` requires an input video stream as well as audio. It rejects audio-only files, including MP3 tracks. For an audio-only track, first obtain consent to create temporary analysis media. Use `background.py` to create a silent carrier at the measured full duration of the track, then `audio.py --replace` to put the track on it. Read the installed manual for duration, output-path, and encoding arguments. Run `scenes.py --beats` on the resulting audio-bearing video. The carrier must cover the entire track. Keep analysis outputs in a temporary location, and remove them when finished. If temporary media creation is not authorized, state that the audio-only input cannot be measured by this script and use content pacing.

The beat result reports BPM, phase, confidence, beat times, onset count, supported beats, and `usable`. Its default confidence threshold is 0.5. The method uses RMS-flux autocorrelation and differs from the upstream librosa fit. Treat the output as a candidate grid. Do not equate supported-beat count with the upstream match score or residual test.

If the candidate fails or cannot be validated, ask for consent before running `uv run --with librosa --with scipy --python 3.11`. This command may download packages. Without consent, report the failure and pace the timeline to content rather than claiming beat accuracy.

## Time and frame mapping

Keep analysis values in seconds and preserve the source phase as an audit value. For a constant tempo, define the beat time as:

```ts
const SOURCE_BEAT0 = 0.2244;
const BEAT_INTERVAL = 60 / BPM;
const OUTPUT_AUDIO_OFFSET_SEC = 0; // measured for this output pipeline
const beatT = (n: number) => SOURCE_BEAT0 + OUTPUT_AUDIO_OFFSET_SEC + n * BEAT_INTERVAL;
const beatF = (n: number) => Math.round(beatT(n) * FPS);
```

Replace the example values with measured values. Keep the source phase immutable. Apply measured output offset as a separate value. Convert seconds to frames only in `beatF`.

Use `beatF(n)` for regular cuts and beat-driven keyframes. Use measured transients for sparse accents and ending holds. Record intended cut frames and measured beat frames after rendering. At 30 fps, frame rounding alone can add up to half a frame period, about 16.7 ms.
