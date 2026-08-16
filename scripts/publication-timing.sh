#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "Publication timing error: $1" >&2
  exit 2
}

format_duration() {
  local seconds=$1
  local minutes=$((seconds / 60))
  local remainder=$((seconds % 60))

  if ((minutes > 0)); then
    printf '%dm %02ds' "$minutes" "$remainder"
  else
    printf '%ds' "$remainder"
  fi
}

command_name=${1:-}
case "$command_name" in
  record)
    [[ $# -eq 5 ]] || fail "record expects FILE PHASE START_SECONDS END_SECONDS"
    timing_file=$2
    phase=$3
    start_seconds=$4
    end_seconds=$5
    [[ "$phase" =~ ^[A-Za-z0-9][A-Za-z0-9._:/\ -]*$ ]] || fail "phase contains unsafe characters"
    [[ "$start_seconds" =~ ^[0-9]+$ ]] || fail "start time is not an integer"
    [[ "$end_seconds" =~ ^[0-9]+$ ]] || fail "end time is not an integer"
    ((end_seconds >= start_seconds)) || fail "end time precedes start time"
    printf '%s\t%s\n' "$phase" "$((end_seconds - start_seconds))" >>"$timing_file"
    ;;
  render)
    [[ $# -eq 3 ]] || fail "render expects TITLE FILE"
    title=$2
    timing_file=$3
    [[ "$title" =~ ^[A-Za-z0-9][A-Za-z0-9._:/\ -]*$ ]] || fail "title contains unsafe characters"
    [[ -f "$timing_file" ]] || fail "timing file does not exist"
    printf '## %s\n\n' "$title"
    printf '| Phase | Duration |\n'
    printf '| --- | ---: |\n'
    while IFS=$'\t' read -r phase seconds; do
      [[ -n "$phase" && "$seconds" =~ ^[0-9]+$ ]] || fail "invalid timing record"
      printf '| %s | %s |\n' "$phase" "$(format_duration "$seconds")"
    done <"$timing_file"
    ;;
  *)
    fail "expected record or render"
    ;;
esac
