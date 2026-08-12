#!/usr/bin/env bash
# Bootstrap acceptance harness.

set -euo pipefail

HOST="${1:-}"
MANUAL_TRANSCRIPT="${2:-${ACCEPTANCE_TRANSCRIPT:-}}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROMPT="Let's add a referrals dashboard to the React app."
CLAUDE_PLUGIN_DIR="$ROOT/plugins/trove-workflow"
BOOTSTRAP_RE="trove-brainstorm|using-trove|Trove brainstorm|brainstorm discipline|brainstorm gate"

if [[ -z "$HOST" ]]; then
  exec "$ROOT/tests/acceptance/run-artifact-checks.sh"
fi

assert_before_tool() {
  local transcript="$1"
  if ! grep -Eq "$BOOTSTRAP_RE" "$transcript"; then
    echo "Expected transcript to reference trove-brainstorm or using-trove"
    echo "Transcript: $transcript"
    sed -n '1,120p' "$transcript" || true
    exit 1
  fi
  local first_anchor first_tool
  first_anchor="$(grep -nE "$BOOTSTRAP_RE" "$transcript" | head -n1 | cut -d: -f1)"
  first_tool="$(grep -nE "Edit|Write|Bash|Tool:" "$transcript" | head -n1 | cut -d: -f1 || true)"
  if [[ -n "$first_tool" && "$first_anchor" -gt "$first_tool" ]]; then
    echo "Bootstrap reference appeared after first tool call"
    echo "Transcript: $transcript"
    sed -n '1,120p' "$transcript" || true
    exit 1
  fi
}

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if [[ ! -f "$file" ]]; then
    echo "Missing expected file: $file"
    exit 1
  fi
  if ! grep -Eq "$pattern" "$file"; then
    echo "$message"
    echo "File: $file"
    exit 1
  fi
}

check_manual_transcript_or_print() {
  local host="$1"
  if [[ -n "$MANUAL_TRANSCRIPT" ]]; then
    assert_before_tool "$MANUAL_TRANSCRIPT"
    echo "$host manual transcript acceptance passed"
  else
    echo "Manual transcript still required for PR acceptance: $PROMPT"
    echo "Pass a transcript path as the second argument or set ACCEPTANCE_TRANSCRIPT."
  fi
}

case "$HOST" in
  claude)
    assert_file_contains "$ROOT/plugins/trove-workflow/.claude-plugin/plugin.json" '"SessionStart"' \
      "Claude plugin manifest must contain the SessionStart hook"
    assert_file_contains "$ROOT/plugins/trove-workflow/.claude-plugin/plugin.json" 'session-start\.sh' \
      "Claude plugin manifest must reference the bootstrap hook script"
    assert_file_contains "$ROOT/plugins/trove-workflow/skills/using-trove/SKILL.md" \
      '^name: using-trove$' \
      "Claude using-trove skill must be generated in the plugin"
    echo "claude bootstrap artifacts passed"
    if [[ "${RUN_CLAUDE_ACCEPTANCE_LIVE:-}" == "1" ]]; then
      command -v claude >/dev/null || { echo "claude CLI not found"; exit 127; }
      tmp="$(mktemp -d)"
      cp -R "$ROOT/tests/acceptance/fixtures/claude/." "$tmp/"
      if ! (cd "$tmp" && claude --plugin-dir "$CLAUDE_PLUGIN_DIR" -p "$PROMPT" > transcript.txt 2> stderr.txt); then
        echo "claude bootstrap acceptance failed before transcript assertion"
        echo "Fixture: $tmp"
        if [[ -s "$tmp/transcript.txt" ]]; then
          sed -n '1,40p' "$tmp/transcript.txt"
        fi
        if [[ -s "$tmp/stderr.txt" ]]; then
          sed -n '1,40p' "$tmp/stderr.txt"
        fi
        exit 1
      fi
      assert_before_tool "$tmp/transcript.txt"
      echo "claude live bootstrap acceptance passed"
    else
      check_manual_transcript_or_print "$HOST"
      echo "Set RUN_CLAUDE_ACCEPTANCE_LIVE=1 to capture a headless Claude transcript."
    fi
    ;;
  copilot)
    echo "Copilot CLI headless acceptance is not supported by current GitHub docs."
    echo "Use the AGENTS.md fallback and paste an interactive transcript if needed."
    check_manual_transcript_or_print "$HOST"
    ;;
  cursor)
    assert_file_contains "$ROOT/output/cursor/rules/using-trove.mdc" '^alwaysApply: true$' \
      "Cursor using-trove rule must be always-apply"
    assert_file_contains "$ROOT/output/cursor/.agents/skills/using-trove/SKILL.md" \
      '^disable-model-invocation: true$' \
      "Cursor using-trove skill must be generated with Cursor frontmatter"
    # The .mdc must also ship inside the plugin bundle — that is the path
    # Cursor scans on install. The build-output check above is necessary but
    # not sufficient; this catches the delivery wire-up regressing.
    assert_file_contains "$ROOT/plugins/trove-workflow/rules/using-trove.mdc" '^alwaysApply: true$' \
      "Cursor using-trove rule must be delivered into the plugin bundle"
    assert_file_contains "$ROOT/plugins/trove-workflow/.agents/skills/using-trove/SKILL.md" \
      '^disable-model-invocation: true$' \
      "Cursor using-trove skill must be delivered into the plugin bundle"
    assert_file_contains "$ROOT/plugins/trove-workflow/.cursor-plugin/plugin.json" '"SessionStart"' \
      "Cursor plugin manifest must retain the SessionStart hook"
    assert_file_contains "$ROOT/plugins/trove-workflow/.cursor-plugin/plugin.json" 'session-start\.sh' \
      "Cursor plugin manifest must reference the bootstrap hook script"
    echo "cursor bootstrap artifacts passed"
    check_manual_transcript_or_print "$HOST"
    ;;
  codex)
    assert_file_contains "$ROOT/output/codex/.agents/plugins/trove-workflow/AGENTS.md" \
      'Bootstrap: this plugin ships a discipline anchor at \.agents/skills/using-trove/SKILL\.md' \
      "Codex scoped AGENTS.md must contain the bootstrap pointer"
    assert_file_contains "$ROOT/output/codex/.agents/skills/using-trove/SKILL.md" \
      '^name: using-trove$' \
      "Codex using-trove skill must be generated"
    if [[ "${RUN_CODEX_ACCEPTANCE_LIVE:-}" == "1" ]]; then
      command -v codex >/dev/null || { echo "codex CLI not found"; exit 127; }
      tmp="$(mktemp -d)"
      cp -R "$ROOT/tests/acceptance/fixtures/codex/." "$tmp/"
      cp -R "$ROOT/output/codex/.agents" "$tmp/.agents"
      if ! codex exec \
        --cd "$tmp" \
        --skip-git-repo-check \
        --ephemeral \
        -s read-only \
        --output-last-message "$tmp/transcript.txt" \
        "$PROMPT Before any implementation, say which Trove workflow skill applies. Do not modify files." \
        > "$tmp/codex-events.txt" 2> "$tmp/codex-stderr.txt"; then
        echo "codex live bootstrap acceptance failed"
        echo "Fixture: $tmp"
        sed -n '1,80p' "$tmp/codex-events.txt" || true
        sed -n '1,80p' "$tmp/codex-stderr.txt" || true
        exit 1
      fi
      assert_before_tool "$tmp/codex-events.txt"
      assert_file_contains "$tmp/transcript.txt" 'trove-brainstorm|using-trove' \
        "Codex final transcript must reference the bootstrap skill path"
      echo "codex live bootstrap acceptance passed"
      echo "Transcript: $tmp/transcript.txt"
    fi
    echo "codex bootstrap artifacts passed"
    if [[ "${RUN_CODEX_ACCEPTANCE_LIVE:-}" != "1" ]]; then
      check_manual_transcript_or_print "$HOST"
      echo "Set RUN_CODEX_ACCEPTANCE_LIVE=1 to capture a headless Codex transcript."
    fi
    ;;
  opencode)
    assert_file_contains "$ROOT/output/opencode/plugins/trove-workflow/index.ts" \
      '../../skills/using-trove/SKILL\.md' \
      "OpenCode plugin must read the generated using-trove skill"
    assert_file_contains "$ROOT/output/opencode/plugins/trove-workflow/index.ts" \
      'systemPrompt' \
      "OpenCode plugin must hook the system prompt path"
    assert_file_contains "$ROOT/output/opencode/plugins/trove-workflow/index.ts" \
      'name: "use_skill"' \
      "OpenCode plugin must register a use_skill tool"
    assert_file_contains "$ROOT/output/opencode/plugins/trove-workflow/index.ts" \
      '"trove-brainstorm"' \
      "OpenCode plugin must enumerate workflow skills"
    echo "opencode bootstrap artifacts passed"
    check_manual_transcript_or_print "$HOST"
    ;;
  gemini)
    assert_file_contains "$ROOT/output/gemini/plugins/trove-workflow/gemini-extension.json" \
      '"contextFileName": "GEMINI\.md"' \
      "Gemini extension must point at GEMINI.md"
    assert_file_contains "$ROOT/output/gemini/plugins/trove-workflow/GEMINI.md" \
      '^# using-trove$' \
      "Gemini context file must contain the using-trove body"
    echo "gemini bootstrap artifacts passed"
    check_manual_transcript_or_print "$HOST"
    ;;
  *)
    echo "Unknown host: $HOST"
    exit 2
    ;;
esac
