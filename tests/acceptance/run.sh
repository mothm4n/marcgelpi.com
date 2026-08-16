#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
acceptance_repo_root=$(cd "$acceptance_directory/../.." && pwd)
acceptance_timing_script="$acceptance_repo_root/scripts/publication-timing.sh"
acceptance_timing_tmp=$(mktemp -d "${TMPDIR:-/tmp}/acceptance-timing.XXXXXX")
acceptance_timings="$acceptance_timing_tmp/journeys.tsv"
export HUGO_BUILD_COUNT_FILE="$acceptance_timing_tmp/hugo-build-count"
printf '0\n' >"$HUGO_BUILD_COUNT_FILE"
touch "$acceptance_timings"
trap 'rm -rf "$acceptance_timing_tmp"' EXIT

acceptance_started_at=$(date +%s)

for acceptance_test in "$acceptance_directory"/*.sh; do
  case "$(basename "$acceptance_test")" in
    helpers.sh | run.sh)
      continue
      ;;
  esac

  journey=$(basename "$acceptance_test" .sh)
  journey_started_at=$(date +%s)
  bash "$acceptance_test"
  journey_finished_at=$(date +%s)
  bash "$acceptance_timing_script" record \
    "$acceptance_timings" \
    "$journey" \
    "$journey_started_at" \
    "$journey_finished_at"
done

acceptance_finished_at=$(date +%s)
bash "$acceptance_timing_script" record \
  "$acceptance_timings" \
  "Total acceptance" \
  "$acceptance_started_at" \
  "$acceptance_finished_at"

acceptance_summary="$acceptance_timing_tmp/summary.md"
bash "$acceptance_timing_script" render "Acceptance timing" "$acceptance_timings" >"$acceptance_summary"
printf '\n**Hugo builds:** %s\n' "$(<"$HUGO_BUILD_COUNT_FILE")" >>"$acceptance_summary"
cat "$acceptance_summary"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat "$acceptance_summary" >>"$GITHUB_STEP_SUMMARY"
fi
