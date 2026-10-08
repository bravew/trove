# trove-media

Video and audio editing, product promos, shot recipes, beat synchronization,
and independent delivery review.

| Skill | Use it for |
| --- | --- |
| `trove-ffmpeg` | Editing, transcoding, media inspection, loudness, and delivery checks through the vendored Python engine |
| `trove-product-video` | Choosing a production mode, planning a product promo, rendering both audio versions, and preparing delivery |
| `trove-shot-recipes` | Resolving a named video-shotcraft card and its exact demo before adapting motion |
| `trove-beat-sync` | Measuring a beat grid, validating timing, and re-testing the delivered file |
| `trove-video-review` | Reviewing a finished promo from an independent context with frame-numbered evidence |

`trove-ffmpeg` requires Python 3.9 or newer, plus `ffmpeg` and `ffprobe` on PATH.
Its operating manual and upstream MIT notice travel with each bundle.

The four video-shotcraft adaptations carry Apache-2.0 notices and recorded
changes. Trove ships the methodology and library lookup protocol. The card
library, demo TSX, template project, music, and sound effects come from the
user's own video-shotcraft checkout. Named recipes and template rendering need
that checkout; general direction, pacing, and evidence-based review can still
work without it. Rendering also needs the project's Remotion environment.

When `trove-ffmpeg` is unavailable, the skills list frame extraction, audio
measurements, synchronization re-tests, and delivery checks as unchecked.
They do not claim those checks passed. Package downloads, library clones, and
browser installation require consent.

Every skill is activated by request. The plugin has no file-glob activation,
hooks, agents, rules, or MCP servers. Trove ships no media binary, Python
runtime, speech model, Remotion project, or licensed audio asset.

Install `trove-media` using your host's plugin UI or the
[marketplace installation instructions](../../README.md#install).
For Claude Code, use `/plugin install trove-media@trove` after registering Trove.
