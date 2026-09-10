#!/usr/bin/env bash
# Append one decision row to a TSV decision log.
#
# Usage:
#   log.sh <file> <phase> <decision> <why> <evidence> <result>
#
# Creates <file> with a header row if it does not exist. Timestamps each row
# in UTC ISO-8601. Append-only: never edits prior rows. Guards against
# spreadsheet formula injection by prefixing any cell that begins with one of
# = + - @ with a single quote, so a pasted "=cmd()" is rendered as text.

set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "usage: log.sh <file> <phase> <decision> <why> <evidence> <result>" >&2
  exit 2
fi

file="$1"; shift
header=$'ts\tphase\tdecision\twhy\tevidence\tresult'

if [ ! -e "$file" ]; then
  printf '%s\n' "$header" > "$file"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Neutralize leading formula characters so the cell renders as text.
sanitize() {
  case "$1" in
    [=+@-]*) printf "'%s" "$1" ;;
    *)       printf '%s' "$1" ;;
  esac
}

row="$ts"
for cell in "$@"; do
  # Strip tabs/newlines so one decision stays one row.
  clean="$(printf '%s' "$cell" | tr '\t\n' '  ')"
  row="$row"$'\t'"$(sanitize "$clean")"
done

printf '%s\n' "$row" >> "$file"
