#!/usr/bin/env bash
# Deterministic bootstrap acceptance checks that do not require live host auth.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRANSCRIPT="$ROOT/tests/acceptance/fixtures/manual-transcript.txt"
HOSTS=(claude cursor codex opencode gemini copilot)

for host in "${HOSTS[@]}"; do
  "$ROOT/tests/acceptance/harness-bootstrap.sh" "$host" "$TRANSCRIPT"
done
