#!/usr/bin/env bash
# Opt-in auto-lint hook: runs after file writes/edits to catch formatting issues.
#
# This hook is invoked by Claude Code's PostToolUse hook system. Command hooks
# receive the event payload as JSON on stdin; for Edit/Write tools the edited
# path lives at .tool_input.file_path.

set -euo pipefail

if [[ "${TROVE_AUTO_LINT:-}" != "1" ]]; then
  exit 0
fi

INPUT="$(cat)"
if [[ -z "$INPUT" ]]; then
  exit 0
fi

read_file_path() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tool_input = data.get("tool_input") or {}
value = tool_input.get("file_path") or tool_input.get("path") or ""
if isinstance(value, str):
    print(value)
' 2>/dev/null <<<"$INPUT" || true
  fi
}

FILE="$(read_file_path)"

if [[ -z "$FILE" ]]; then
  exit 0
fi

if [[ "$FILE" = /* || "$FILE" == *".."* ]]; then
  exit 0
fi

case "$FILE" in
  *.py)
    command -v ruff &>/dev/null && ruff check --fix "$FILE" 2>/dev/null || true
    ;;
  *.ts|*.tsx|*.js|*.jsx)
    if [[ -f "node_modules/.bin/eslint" ]]; then
      node_modules/.bin/eslint --fix "$FILE" 2>/dev/null || true
    fi
    ;;
  *.vue)
    if [[ -f "node_modules/.bin/eslint" ]]; then
      node_modules/.bin/eslint --fix "$FILE" 2>/dev/null || true
    fi
    ;;
esac
