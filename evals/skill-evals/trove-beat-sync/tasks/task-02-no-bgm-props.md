# Task: Deliver a no-BGM version from a project

The client says, "The product video is finished. Just strip the music and deliver the no-BGM version alongside it." Use the existing Remotion project to describe the delivery changes and render commands. Preserve matching picture timing, narration and sound effects in both versions. All files, logs and timing values below are fictional fixture data, not measurements of real media or output you have generated.

The fixture project has a 900-frame `ProductFilm` composition at 30 fps. `src/Root.tsx` registers it with `defaultProps={{ bgm: true }}`. The relevant component is:

```tsx
// src/ProductFilm.tsx
export function ProductFilm({ bgm }: { bgm: boolean }) {
  return <>
    <PictureTimeline />
    <Audio src={staticFile('narration.wav')} />
    <SoundEffects />
    <Audio src={staticFile('music.wav')} volume={0.25} />
  </>;
}
```

The last review render is `out/review-bgm.mp4`. Deliverables target YouTube. The existing timeline stores scene boundaries as seconds `[0, 4.2244, 8.2244, 12.2244, 20.2244, 30]` and currently rounds some intermediate beat intervals to frames before multiplying them. A draft proposes full-frame flashes at candidate beat indices `8, 16, 24, 40` without an impact review. Those proposals are not approval to keep every flash.

The track was already placed on a full-duration video carrier `tmp/music-analysis.mp4` with earlier permission. Trove FFmpeg tools and ordinary FFmpeg are installed. A previous fixture analysis log for the carrier reports:

```json
{"bpm":120,"phase":0.2244,"onset_count":94,"supported_beats":87,"confidence":0.82,"usable":true}
```

The log contains no per-beat residuals, match percentage, or half/double-time comparison. No delivered-file beat re-test is present. The client has explicitly declined any new package download, including `uv run --with` dependencies, but permits local analysis and temporary renders with installed tools. Do not request that consent again or install anything.

`tmp/sfx-peaks.json` supplies synthetic source peak lags of 0.012 seconds for `click.wav` and 0.046 seconds for `hit.wav`. Output audio offset has not been measured for the final AAC 48 kHz, 192 kb/s encode. The source phase is the analysis log's value above. No loudness-normalisation result, final peak reading or final content-check report is supplied.

Show how you would produce the two variants and decide what timing evidence is trustworthy. Address the proposed impacts, beat-to-frame mapping if the grid becomes validated, sound alignment and delivery checks. Distinguish supplied scenario evidence, commands you propose, and checks still missing; do not claim renders or measurements have run.
