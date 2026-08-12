# Hooks

Hooks are deterministic shell scripts the host runs at lifecycle
boundaries — session start, prompt submit, tool call, session end. They
exist to enforce policy and surface context cheaply, **not** to implement
business logic.

## Supported events

We support the documented Claude Code hook events. Adding a new event
name in this repo means it must correspond to a real host-supported
event, not speculative behavior.

| Event | Fires when | Typical use |
|---|---|---|
| `PreToolUse` | Before any tool runs | Block dangerous commands; require confirmation on destructive surfaces |
| `PostToolUse` | After a tool succeeds | Run an opt-in linter/formatter on edited files; light reporting |
| `PostToolUseFailure` | After a tool fails | Capture failure diagnostics |
| `PostToolBatch` | After a batch of parallel tool calls resolves | Summarize batched tool results |
| `PermissionRequest` | A permission dialog appears | Add policy context to permission decisions |
| `PermissionDenied` | Auto-mode denies a tool call | Tell the model whether retry is allowed |
| `Notification` | Host emits a notification | Forward to a logging surface |
| `UserPromptSubmit` | User submits a prompt | Inject project context the model wouldn't otherwise have |
| `UserPromptExpansion` | A user-typed command expands | Block or annotate command expansion |
| `MessageDisplay` | Assistant text streams | Display-only instrumentation |
| `Stop` | Conversation stops | Cleanup, report metrics |
| `StopFailure` | Turn ends due to API error | Error telemetry |
| `SubagentStart` | A sub-agent starts | Track delegated work |
| `SubagentStop` | A sub-agent stops | Aggregate sub-agent findings |
| `TaskCreated` | A task is created | Task bookkeeping |
| `TaskCompleted` | A task is completed | Task bookkeeping |
| `Setup` | `--init-only`, `--init`, or maintenance setup runs | One-time preparation |
| `InstructionsLoaded` | Instructions are loaded into context | Context auditing |
| `ConfigChange` | Configuration changes | React to settings changes |
| `CwdChanged` | Working directory changes | Environment management |
| `FileChanged` | A watched file changes | File-specific reactive hooks |
| `WorktreeCreate` | A worktree is being created | Custom worktree setup |
| `WorktreeRemove` | A worktree is being removed | Custom cleanup |
| `PreCompact` | Before context compaction | Persist things you don't want compacted away |
| `PostCompact` | After compaction completes | Restore compacted context |
| `SessionStart` | Session opens | Surface project name, branch, recent commits — cheap orientation |
| `SessionEnd` | Session closes | Final cleanup; release acquired resources |
| `Elicitation` | An MCP server requests user input | Validate elicitation requests |
| `ElicitationResult` | The user responds to MCP elicitation | Validate returned elicitation data |

## Schema

In `plugin.yaml`:

```yaml
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      command: "${PLUGIN_ROOT}/hooks/auto-lint.sh"
      description: "Opt-in auto-lint after file writes"

  PreToolUse:
    - matcher: "Bash"
      command: "${PLUGIN_ROOT}/hooks/security-check.sh"
      description: "Deny known destructive shell commands"
```

| Field | Required | Notes |
|---|:---:|---|
| `command` | Yes | Shell command. `${PLUGIN_ROOT}` resolves to the plugin's directory. |
| `matcher` | For `PreToolUse` / `PostToolUse` (warned otherwise — without it, the hook fires on every tool call) | Tool-name regex. Examples: `"Write\|Edit"`, `"Bash"`. |
| `description` | No | One-line author note. Surfaced in `bun run validate` output. |

`bun run validate` enforces:

- Event names are in the supported list (otherwise: error).
- Each entry's `command` exists at the resolved path (otherwise: error).
- Each entry's `command` script is executable (otherwise: warning).
- Each `matcher` compiles as a regex (otherwise: error).
- `PreToolUse` / `PostToolUse` entries have a `matcher` (otherwise: warning).

## Good first hook patterns

- **Post-edit lint.** A two-second `ruff check --fix` or `eslint --fix`
  on the touched file, gated behind an explicit opt-in environment
  variable such as `TROVE_AUTO_LINT=1`. Surfaces formatting issues
  before the user has to read them in a diff without surprising edits.
  See `plugins/trove-dev/hooks/auto-lint.sh`.
- **Dangerous-command policy.** `PreToolUse` matcher `"Bash"`, regex
  the command for known footguns (`rm -rf /`, `DROP TABLE`,
  `git push --force`, `chmod 777`), and return a
  `hookSpecificOutput.permissionDecision: "deny"`. See
  `plugins/trove-security/hooks/security-check.sh`.
- **Project orientation.** `SessionStart` printing project name +
  current branch + last 3 commits. Sub-30ms. Prefer one shared
  bootstrap hook such as `plugins/trove-workflow/hooks/session-start.sh`.

## Anti-patterns

- **Speculative event names.** If the host doesn't document the event,
  don't define a hook for it. Validation will reject it anyway.
- **Long-running scripts.** Hooks are inline in the agent's loop. A
  3-second hook means every prompt is 3 seconds slower. Aim for
  sub-100ms; explicit budget if longer.
- **Business logic in shell.** If a hook is doing real work (DB
  writes, API calls, multi-file transformations), it belongs in a
  skill or sub-agent, not a hook.
- **Legacy input channels.** Command hooks receive the event payload as
  JSON on stdin. Do not read `${TOOL_INPUT_path}`,
  `${TOOL_INPUT_command}`, or `${CLAUDE_WORKSPACE_DIR}` for tool input.

## Output

Hooks read JSON from stdin and write JSON or terse text to stdout for
the host to capture. Keep output small and deterministic — under ~10
lines for `SessionStart`, near-silent for `PostToolUse` unless there's
a real signal. For `PreToolUse`, prefer structured JSON decisions:
`hookSpecificOutput.permissionDecision: "deny"` plus a
`permissionDecisionReason`; exit code `2` with stderr is the hard-block
fallback when JSON cannot be emitted.
