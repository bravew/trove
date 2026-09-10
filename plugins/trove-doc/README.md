# trove-doc

Skills for linked notes, structured note views, visual boards, and web clipping.
The initial set is adapted from Steph Ango's MIT-licensed Obsidian skills.

| Skill | Use it for | Requirements |
| --- | --- | --- |
| `trove-obsidian-markdown` | Obsidian properties, links, embeds, and callouts | A vault or explicit request for Obsidian syntax |
| `trove-obsidian-bases` | `.base` filters, formulas, views, and summaries | Obsidian to evaluate and render views |
| `trove-json-canvas` | Portable `.canvas` boards with nodes, groups, and edges | File access; a compatible viewer for visual checks |
| `trove-obsidian-cli` | Search, read, and requested vault changes | An installed and enabled Obsidian desktop CLI |
| `trove-web-clip` | Clean Markdown from articles or HTML | A host reader; Defuddle is optional |

The file-format skills can author files without a running Obsidian app.
They distinguish structural validation from checks that need a live viewer.
Only `.base` and `.canvas` receive file-glob activation. Plain `.md` files do
not automatically receive Obsidian syntax. The CLI and clipping workflows
declare no hooks, MCP servers, or automatic package installations.

## Try it

- "Create an Obsidian project note linking the existing decision records."
- "Build Tasks.base with active and completed views and days until due."
- "Create a JSON Canvas research board from these notes."
- "Search my Work Obsidian vault for onboarding notes."
- "Clip this article as Markdown and save it in Reading."

Install `trove-doc` from the Trove marketplace using your host's plugin UI
or the existing [marketplace installation instructions](../../README.md#install).
For Claude Code, use `/plugin install trove-doc@trove` after registering Trove.

## Scope and maintenance

This plugin currently covers Obsidian and portable knowledge artifacts. It
does not supply Word/PDF/slide tooling or a general API documentation writer.
`trove-docs-sync-audit` remains in `trove-dev` because it compares repository
documentation to code. There is no skill named `trove-doc`; that is the plugin.

The canonical sources live under `skills/documentation/`; generated bundles
cover Claude, Cursor, Codex, Copilot, OpenCode, Gemini, and generic AGENTS.md.
Per-skill rubrics and task prompts live in `evals/skill-evals/`.

Source revision, selection rationale, corrections, and maintenance boundaries
are recorded in the [extraction review](../../dev-doc/2026-09-obsidian-skills-extraction.md).
Each distributed skill includes the upstream MIT notice in `references/LICENSE.md`.
