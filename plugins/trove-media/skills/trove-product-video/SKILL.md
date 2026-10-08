---
name: trove-product-video
description: "Plan and produce a cinematic product promo from a frontend project or product interface. Use for a full product video, a video-shotcraft template adaptation, or a requested vertical re-composition. Do not use for general video editing."
license: MIT
when_to_use: "turn this product into a promo video; make a product video from this app; adapt the video-shotcraft template for my product; make a vertical version of this product promo"
user-invocable: true
metadata:
  source: Vincentwei1021/video-shotcraft
  upstream-skill: video-shotcraft
  upstream-revision: 5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

# Product video production

Use this skill for a product promo built around a real product interface. For ordinary editing or transcoding of existing footage, use `trove-ffmpeg` directly. This skill owns direction, storyboard, capture, Remotion implementation, and the product-video handoff.

## Choose a mode

Start with a minimal, read-only inspection of the product and the user's stated goals. Do not start its server, capture pages, inspect live data, install dependencies, or modify files during this inspection. Then select one of three modes:

- **Template adaptation** when the user names the video-shotcraft template or wants its established structure. Locate the user's checkout and follow its template branch.
- **Autonomous creation** when the user asks the agent to decide the creative direction and make the promo. Record the evidence and decisions as you proceed.
- **Guided co-creation** when the user wants to participate in visual direction, storyboard, or other creative decisions.

When the user has named a mode, honor it without asking them to choose again. Otherwise recommend the best fit from their request and product evidence. Ask only when an unresolved decision would materially change the result. Read [modes.md](references/modes.md) and [pipeline.md](references/pipeline.md) before production.

## Production rules

- Reproduce a real interface with genuine screenshots from the user's product. Do not redraw a live UI as invented markup and present it as a capture.
- Extract colors, typography, spacing, surfaces, and motion character from the product. Use the same design tokens across screens, transitions, and effects.
- Before any capture, identify private, customer, personal, internal, credential, or live data. Use a safe frozen dataset or mask it. Capture only after sensitive content is protected.
- Follow stages 0–7 and the default energy arc in [pipeline.md](references/pipeline.md). Keep a clear hold after important information lands.
- Make renders deterministic. Do not use wall-clock time, unseeded randomness, or other changing inputs in frame calculations.
- A vertical version is a new composition designed for a 9:16 frame. Re-layout interface elements and protect readability. Never make it by cropping the finished 16:9 render.

## Use the template checkout

The template project is not bundled. Use a path supplied by the user or an existing video-shotcraft checkout they identify. Do not clone, install, or fetch assets without authorization. Read that checkout's `template/TEMPLATE.md` and `template/THEMES.md`. Preserve the user's checkout and its assets. Select or customize the theme at render time through the composition's `--props` JSON using its supported `theme` and optional `colors` fields. Do not edit its theme source or assume its default theme. If no checkout is available, explain which template-specific work is unavailable and offer the autonomous or guided route.

## Delivery handoff

Immediately before the first render, state once that Remotion is free for individuals and small teams, while companies may need a paid license, and link the [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md). Render both BGM and no-BGM versions from the same Remotion timeline using the project's props. Never strip music from the finished video to create the stem. For a named destination, normalize the BGM version to its target with `loudness.py`, re-test timing on that file with `scenes.py --beats`, and inspect acceptance frames with `look.py --at`. Use `audio.py` for offset probes against approved sound cues. Measure the no-BGM stem only with `loudness.py --measure-only`; do not normalize it. Run `check.py --platform <destination> --content` on each delivered file. Report measured results and any unavailable checks. Use only the documented `trove-ffmpeg` wrappers and mode flags needed for each step. See [pipeline.md](references/pipeline.md#stage-7-acceptance-and-delivery) and [LICENSE.md](references/LICENSE.md).

Do not promote the upstream author, gallery, or submission page. Keep the handoff focused on the user's deliverables. See [LICENSE.md](references/LICENSE.md) for the upstream license and adaptation notice.
