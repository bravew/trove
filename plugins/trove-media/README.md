# trove-media

Skills for working with video and audio files: editing, transcoding, delivery
checks, and production workflows.

This plugin ships with no skills yet. `trove-ffmpeg` is the first, followed by
the video-shotcraft skills.

Every skill in this plugin is activated by request only. The plugin declares no
file-glob activation, hooks, agents, rules, or MCP servers: a `.mp4` in a
repository is not a request to edit it. Trove ships no ffmpeg binary, Python
runtime, or speech model; those are the user's to install.

Install `trove-media` from the Trove marketplace using your host's plugin UI
or the existing [marketplace installation instructions](../../README.md#install).
For Claude Code, use `/plugin install trove-media@trove` after registering Trove.
