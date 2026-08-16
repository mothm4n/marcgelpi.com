#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
acceptance_repo_root=$(cd "$acceptance_directory/../.." && pwd)
acceptance_timing_script="$acceptance_repo_root/scripts/publication-timing.sh"
acceptance_timing_tmp=$(mktemp -d "${TMPDIR:-/tmp}/acceptance-timing.XXXXXX")
acceptance_timings="$acceptance_timing_tmp/journeys.tsv"
playwright_timings="$acceptance_timing_tmp/playwright-journeys.tsv"
playwright_build_report="$acceptance_timing_tmp/playwright-standard-builds.tsv"
export HUGO_BUILD_COUNT_FILE="$acceptance_timing_tmp/hugo-build-count"
export PLAYWRIGHT_TIMINGS="$playwright_timings"
export PLAYWRIGHT_BUILD_REPORT="$playwright_build_report"
printf '0\n' >"$HUGO_BUILD_COUNT_FILE"
touch "$acceptance_timings"
trap 'rm -rf "$acceptance_timing_tmp"' EXIT

acceptance_started_at=$(date +%s)

playwright_started_at=$(date +%s)
(
  cd "$acceptance_repo_root"
  npx playwright test
)
playwright_finished_at=$(date +%s)

cat "$playwright_timings" >>"$acceptance_timings"
site_shell_duration=$(awk -F '\t' '$1 == "site-shell" { print $2 }' "$playwright_timings")
[[ "$site_shell_duration" =~ ^[0-9]+$ ]] || {
  echo "FAIL: Playwright Test did not report site-shell timing" >&2
  exit 1
}
if ((site_shell_duration > 86)); then
  echo "FAIL: Playwright Test site-shell took ${site_shell_duration}s; budget is 86s" >&2
  exit 1
fi

production_builds=$(awk -F '\t' '$1 == "production" { print $2 }' "$playwright_build_report")
preview_builds=$(awk -F '\t' '$1 == "preview" { print $2 }' "$playwright_build_report")
if [[ "$production_builds" != 1 || "$preview_builds" != 1 ]]; then
  echo "FAIL: Playwright standard builds were production=${production_builds:-missing}, preview=${preview_builds:-missing}" >&2
  exit 1
fi

bash "$acceptance_timing_script" record \
  "$acceptance_timings" \
  "Playwright Test group" \
  "$playwright_started_at" \
  "$playwright_finished_at"

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
printf '\n**Playwright standard builds:** production=1, preview=1\n' >>"$acceptance_summary"
cat "$acceptance_summary"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat "$acceptance_summary" >>"$GITHUB_STEP_SUMMARY"
fi
