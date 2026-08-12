#!/usr/bin/env bash
# Security check hook: blocks known destructive Bash commands.
#
# This hook is invoked by Claude Code's PreToolUse hook system. Command hooks
# receive the event payload as JSON on stdin; Bash command text lives at
# .tool_input.command. A deny decision blocks the tool call.

set -euo pipefail

INPUT="$(cat)"
if [[ -z "$INPUT" ]]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  echo "security-check.sh: jq or python3 required to parse hook JSON" >&2
  exit 2
fi

read_command() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tool_input = data.get("tool_input") or {}
value = tool_input.get("command") or ""
if isinstance(value, str):
    print(value)
' 2>/dev/null <<<"$INPUT" || true
  fi
}

emit_deny() {
  local pattern="$1"
  local reason="$2"
  local command="$3"

  if command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg pattern "$pattern" \
      --arg reason "$reason" \
      --arg command "$command" \
      '{
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: ($reason + " Matched: " + $pattern + ". Command: " + $command)
        }
      }'
    return
  fi

  python3 - "$pattern" "$reason" "$command" <<'PY'
import json, sys
pattern, reason, command = sys.argv[1], sys.argv[2], sys.argv[3]
json.dump({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": f"{reason} Matched: {pattern}. Command: {command}",
    }
}, sys.stdout)
sys.stdout.write("\n")
PY
}

COMMAND="$(read_command)"

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

PATTERN=""
REASON=""

case "$COMMAND" in
  *"rm -rf /"*|*"rm -fr /"*|*"rm -Rf /"*|*"rm -rF /"*)
    PATTERN="rm -rf /"
    REASON="Refusing to run a recursive deletion against an absolute path."
    ;;
  *"git reset --hard"*)
    PATTERN="git reset --hard"
    REASON="Refusing to discard working tree changes without explicit human approval."
    ;;
  *"chmod 777"*)
    PATTERN="chmod 777"
    REASON="Refusing to make files world-writable."
    ;;
  *":(){ :|:& };:"*)
    PATTERN="fork bomb"
    REASON="Refusing to run a fork-bomb pattern."
    ;;
esac

if printf '%s' "$COMMAND" | grep -Eiq '\bDROP[[:space:]]+(TABLE|DATABASE)\b'; then
  PATTERN="DROP TABLE/DATABASE"
  REASON="Refusing to run destructive SQL from a shell command."
fi

if printf '%s' "$COMMAND" | grep -Eiq '\bgit[[:space:]]+push\b.*--force([^[:alnum:]_-]|$)'; then
  PATTERN="git push --force"
  REASON="Refusing to force-push without explicit human approval."
fi

if [[ -n "$PATTERN" ]]; then
  emit_deny "$PATTERN" "$REASON" "$COMMAND"
fi
