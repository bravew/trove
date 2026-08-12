#!/usr/bin/env bash
# Warn-only skill-triggering smoke runner for headless Claude sessions.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLAUDE_PLUGIN_DIR="$ROOT/plugins/trove-workflow"

check_fixtures() {
  local failures=0
  for skill_dir in "$ROOT"/tests/skill-triggering/*; do
    [[ -d "$skill_dir" ]] || continue
    local skill prompts expected count h2_count
    skill="$(basename "$skill_dir")"
    prompts="$skill_dir/prompts.md"
    expected="$skill_dir/expected.yaml"
    if [[ ! -f "$prompts" ]]; then
      echo "missing prompts.md for $skill"
      failures=$((failures + 1))
      continue
    fi
    if [[ ! -f "$expected" ]]; then
      echo "missing expected.yaml for $skill"
      failures=$((failures + 1))
      continue
    fi
    count="$(grep -c '^Prompt:' "$prompts" || true)"
    if [[ "$count" -lt 3 ]]; then
      echo "$skill has $count prompt(s); expected at least 3"
      failures=$((failures + 1))
    fi
    h2_count="$(grep -c '^## ' "$prompts" || true)"
    if [[ "$h2_count" -lt 3 ]]; then
      echo "$skill has $h2_count H2 prompt section(s); expected at least 3"
      failures=$((failures + 1))
    fi
    if ! grep -Eq '^skill_invoked:[[:space:]]*(true|false)$' "$expected"; then
      echo "$skill expected.yaml missing boolean skill_invoked"
      failures=$((failures + 1))
    fi
    if ! grep -Eq '^before_first_edit:[[:space:]]*(true|false)$' "$expected"; then
      echo "$skill expected.yaml missing boolean before_first_edit"
      failures=$((failures + 1))
    fi
  done
  return "$failures"
}

expected_bool() {
  local file="$1"
  local key="$2"
  awk -F: -v key="$key" '$1 == key { gsub(/[[:space:]]/, "", $2); print $2; exit }' "$file"
}

first_line_matching() {
  local file="$1"
  local pattern="$2"
  grep -nE "$pattern" "$file" | head -n1 | cut -d: -f1 || true
}

if [[ "${RUN_SKILL_TRIGGERING_LIVE:-}" != "1" ]]; then
  echo "RUN_SKILL_TRIGGERING_LIVE=1 not set; structure-only skill-triggering check."
  check_fixtures
  find "$ROOT/tests/skill-triggering" -name expected.yaml -print | sort
  exit 0
fi

check_fixtures

if ! command -v claude >/dev/null; then
  echo "claude CLI not found; skipping skill-triggering smoke tests"
  exit 0
fi

failures=0
total=0

for expected in "$ROOT"/tests/skill-triggering/*/expected.yaml; do
  [[ -f "$expected" ]] || continue
  skill="$(basename "$(dirname "$expected")")"
  prompts="$ROOT/tests/skill-triggering/$skill/prompts.md"
  [[ -f "$prompts" ]] || continue
  skill_expected="$(expected_bool "$expected" skill_invoked)"
  before_edit_expected="$(expected_bool "$expected" before_first_edit)"
  skill_total=0
  skill_passed=0
  while IFS= read -r prompt; do
    [[ -n "$prompt" ]] || continue
    total=$((total + 1))
    skill_total=$((skill_total + 1))
    tmp="$(mktemp -d)"
    if ! (cd "$tmp" && claude --plugin-dir "$CLAUDE_PLUGIN_DIR" -p "$prompt" > transcript.txt 2> stderr.txt); then
      echo "skill-triggering: claude run failed for $skill"
      echo "Fixture: $tmp"
      sed -n '1,20p' "$tmp/transcript.txt" || true
      sed -n '1,20p' "$tmp/stderr.txt" || true
      failures=$((failures + 1))
      continue
    fi
    prompt_ok=1
    skill_line="$(first_line_matching "$tmp/transcript.txt" "$skill")"
    if [[ "$skill_expected" == "true" && -z "$skill_line" ]]; then
      prompt_ok=0
    elif [[ "$skill_expected" == "false" && -n "$skill_line" ]]; then
      prompt_ok=0
    fi

    if [[ "$before_edit_expected" == "true" ]]; then
      tool_line="$(first_line_matching "$tmp/transcript.txt" 'Edit|Write|Bash|Tool:')"
      if [[ -n "$tool_line" && -n "$skill_line" && "$skill_line" -gt "$tool_line" ]]; then
        prompt_ok=0
      elif [[ -n "$tool_line" && -z "$skill_line" ]]; then
        prompt_ok=0
      fi
    fi

    if [[ "$prompt_ok" -eq 1 ]]; then
      skill_passed=$((skill_passed + 1))
    else
      failures=$((failures + 1))
    fi
  done < <(grep '^Prompt:' "$prompts" | sed 's/^Prompt:[[:space:]]*//')

  required=$(( (skill_total * 2 + 2) / 3 ))
  if [[ "$skill_passed" -lt "$required" ]]; then
    echo "skill-triggering: $skill failed threshold ($skill_passed/$skill_total passed; required $required)"
    exit 1
  fi
done

echo "skill-triggering: $((total - failures))/$total passed"
