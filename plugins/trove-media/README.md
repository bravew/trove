# trove-media

Skills for working with video and audio files: editing, transcoding, delivery
checks, and production workflows.

`trove-ffmpeg` edits video and audio through a vendored Python engine. It
requires Python 3.9 or newer and `ffmpeg` and `ffprobe` on PATH. Its operating
manual and upstream MIT notice ship with the skill. The video-shotcraft skills
are planned for the next wave.

Every skill in this plugin is activated by request only. The plugin declares no
file-glob activation, hooks, agents, rules, or MCP servers: a `.mp4` in a
repository is not a request to edit it. Trove ships no ffmpeg binary, Python
runtime, or speech model; those are the user's to install.

Install `trove-media` from the Trove marketplace using your host's plugin UI
or the existing [marketplace installation instructions](../../README.md#install).
For Claude Code, use `/plugin install trove-media@trove` after registering Trove.
