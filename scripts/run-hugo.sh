#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${HUGO_BUILD_COUNT_FILE:-}" ]]; then
  count_directory=$(dirname "$HUGO_BUILD_COUNT_FILE")
  mkdir -p "$count_directory"
  count_lock="$HUGO_BUILD_COUNT_FILE.lock"
  while ! mkdir "$count_lock" 2>/dev/null; do
    sleep 0.01
  done
  trap 'rmdir "$count_lock" 2>/dev/null || true' EXIT INT TERM

  count=0
  if [[ -f "$HUGO_BUILD_COUNT_FILE" ]]; then
    read -r count <"$HUGO_BUILD_COUNT_FILE"
  fi
  [[ "$count" =~ ^[0-9]+$ ]] || {
    rmdir "$count_lock"
    echo "Invalid Hugo build count" >&2
    exit 2
  }
  printf '%s\n' "$((count + 1))" >"$HUGO_BUILD_COUNT_FILE"
  rmdir "$count_lock"
  trap - EXIT INT TERM
fi

exec hugo "$@"
