#!/usr/bin/env bash
# SessionStart hook for the Trove workflow plugin.
#
# Emits a JSON envelope containing the using-trove discipline anchor so the
# active host (Claude Code, Cursor, or a generic AGENTS.md fallback) prepends
# it to the session context.
#
# Security posture:
#   - set -euo pipefail; treat unset vars and pipeline errors as fatal.
#   - Read-only operation; no network, no inherited stdin, no eval.
#   - Anchor file is loaded by absolute path resolved from $0; never from env.
#   - JSON is built by jq (--rawfile) or python3 json.dumps. Manual bash
#     escaping is intentionally avoided because it cannot safely round-trip
#     C0 control characters or surrogate pairs.
#   - Hard-fails to stderr if neither jq nor python3 is available rather than
#     emitting malformed JSON the host might mis-parse.
#   - TROVE_BOOTSTRAP=0 disables the hook for opt-out.

set -euo pipefail

if [[ "${TROVE_BOOTSTRAP:-}" == "0" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SKILL_PATH="${PLUGIN_ROOT}/skills/using-trove/SKILL.md"

if [[ ! -f "$SKILL_PATH" ]]; then
  printf 'session-start.sh: anchor missing at %s; skipping bootstrap\n' \
    "$SKILL_PATH" >&2
  exit 0
fi

PRELUDE=$'Skill: using-trove (Trove discipline anchor)\nWhen this anchor routes you to a Trove workflow skill, start the visible response with the literal selected skill name, for example: Skill: trove-brainstorm.\n\n'

# Pick the envelope shape the active host expects. Claude Code wants
# {hookSpecificOutput: {...}}; Cursor wants {additional_context: ...};
# the AGENTS.md fallback uses {additionalContext: ...}. Copilot CLI
# inherits CLAUDE_PLUGIN_ROOT for compatibility but expects the generic
# shape, so the COPILOT_CLI guard breaks the tie.
if [[ -n "${CURSOR_PLUGIN_ROOT:-}" ]]; then
  STYLE="cursor"
elif [[ -n "${CLAUDE_PLUGIN_ROOT:-}" && -z "${COPILOT_CLI:-}" ]]; then
  STYLE="claude"
else
  STYLE="default"
fi

emit_with_jq() {
  case "$STYLE" in
    claude)
      jq -n --arg prelude "$PRELUDE" --rawfile content "$SKILL_PATH" \
        '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: ($prelude + $content)}}'
      ;;
    cursor)
      jq -n --arg prelude "$PRELUDE" --rawfile content "$SKILL_PATH" \
        '{additional_context: ($prelude + $content)}'
      ;;
    *)
      jq -n --arg prelude "$PRELUDE" --rawfile content "$SKILL_PATH" \
        '{additionalContext: ($prelude + $content)}'
      ;;
  esac
}

emit_with_python() {
  python3 - "$STYLE" "$SKILL_PATH" "$PRELUDE" <<'PY'
import json, sys
style, skill_path, prelude = sys.argv[1], sys.argv[2], sys.argv[3]
with open(skill_path, "r", encoding="utf-8") as fh:
    content = fh.read()
ctx = prelude + content
if style == "claude":
    out = {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ctx}}
elif style == "cursor":
    out = {"additional_context": ctx}
else:
    out = {"additionalContext": ctx}
sys.stdout.write(json.dumps(out, ensure_ascii=False))
sys.stdout.write("\n")
PY
}

if command -v jq >/dev/null 2>&1; then
  emit_with_jq
elif command -v python3 >/dev/null 2>&1; then
  emit_with_python
else
  printf 'session-start.sh: jq or python3 required to emit JSON safely; install one and retry\n' >&2
  exit 1
fi
