# Trove Bootstrap

Trove workflow bootstrap starts with the `trove-workflow` plugin.

`using-trove` is a discipline anchor, not a user-facing methodology skill. It is loaded once at session start where the host supports session hooks, and it points the assistant to the generated routing index before code, planning, review, debugging, or git work.

## Host Paths

- Claude Code: `plugins/trove-workflow/hooks/session-start.sh` emits `hookSpecificOutput.additionalContext`.
- Copilot CLI: current GitHub docs say `sessionStart` command-hook output is not processed. Trove relies on scoped `AGENTS.md` for non-interactive Copilot use and can use a prompt-style `sessionStart` hook only for new interactive sessions.
- Cursor: the hook remains in the plugin manifest, `output/cursor/.agents/skills/using-trove/SKILL.md` is emitted as a native skill, and `output/cursor/rules/using-trove.mdc` is always-apply while Cursor hook context is unreliable.
- Codex and generic AGENTS.md hosts: scoped `AGENTS.md` files contain a bootstrap pointer to `.agents/skills/using-trove/SKILL.md`.
- OpenCode: `output/opencode/plugins/trove-workflow/index.ts` prepends the anchor through the host plugin surface.
- Gemini CLI: `output/gemini/plugins/trove-workflow/gemini-extension.json` points at `GEMINI.md`, generated from the anchor body.

## Opt-out

Set `TROVE_BOOTSTRAP=0` to silence the SessionStart hook. Plugin authors can set `bootstrap.sessionStart: false` in `plugin.yaml` when a plugin has a SessionStart hook that should not contribute a discipline anchor.

## Size Budget

`bun run validate` warns when multiple installed `using-*` anchors exceed 8000 bytes of combined SessionStart context.

## Acceptance Checks

Run deterministic artifact checks with:

```bash
bun run test:acceptance:artifacts
```

For live host evidence:

```bash
RUN_CLAUDE_ACCEPTANCE_LIVE=1 bun run test:acceptance claude
RUN_CODEX_ACCEPTANCE_LIVE=1 bun run test:acceptance codex
RUN_SKILL_TRIGGERING_LIVE=1 tests/skill-triggering/run.sh
```

Hosts without a reliable headless mode can pass a transcript path:

```bash
bun run test:acceptance cursor path/to/transcript.txt
```

The transcript must reference `using-trove` or `trove-brainstorm` before the first tool action.
