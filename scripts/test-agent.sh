#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
report_directory=$(mktemp -d "${TMPDIR:-/tmp}/agent-test.XXXXXX")
report_directory=$(cd "$report_directory" && pwd -P)
full_log="$report_directory/test.log"
export ACCEPTANCE_REPORT_DIRECTORY="$report_directory/acceptance"
mkdir -p "$ACCEPTANCE_REPORT_DIRECTORY"

if [[ $# -eq 0 ]]; then
  set -- npm test
fi

started_at=$(date +%s)
test_status=0
(cd "$repo_root" && "$@") >"$full_log" 2>&1 || test_status=$?
finished_at=$(date +%s)
bash "$repo_root/scripts/publication-timing.sh" record \
  "$report_directory/timings.tsv" 'Tests' "$started_at" "$finished_at"
if [[ "$test_status" -eq 0 ]]; then
  printf 'PASS: tests (%ss)\n' "$((finished_at - started_at))"
else
  printf 'FAIL: tests (exit %s; %ss)\n' "$test_status" "$((finished_at - started_at))"
  failure_report="$ACCEPTANCE_REPORT_DIRECTORY/failure-summary.tsv"
  reported_failures=0
  if [[ -f "$failure_report" ]]; then
    reported_failures=$(awk -F '\t' 'NR > 1 && NF == 6 { count++ } END { print count + 0 }' "$failure_report")
  fi
  if ((reported_failures > 0)); then
    awk -F '\t' '
      NR > 1 && NF == 6 {
        failures++
        if (failures <= 8) {
          printf "  - %s: %s (%s:%s; retry %s)\n", $1, $4, $2, $3, $6
        }
      }
      END {
        if (failures > 8) printf "  - %d further failed checks; see the full log\n", failures - 8
      }
    ' "$failure_report"
  else
    awk '
      /^FAIL:/ {
        failures++
        if (failures <= 8) printf "  - %s\n", substr($0, 1, 240)
      }
      END {
        if (failures > 8) printf "  - %d further failed checks; see the full log\n", failures - 8
        if (failures == 0) print "  - Test command failed before a check report; see the full log"
      }
    ' "$full_log"
  fi
fi

acceptance_timings="$ACCEPTANCE_REPORT_DIRECTORY/journeys.tsv"
journey_timings="$ACCEPTANCE_REPORT_DIRECTORY/playwright-journeys.tsv"
if [[ -f "$acceptance_timings" && -f "$journey_timings" ]]; then
  acceptance_seconds=$(awk -F '\t' '$1 == "Total acceptance" { print $2 }' "$acceptance_timings")
  if [[ "$acceptance_seconds" =~ ^[0-9]+$ ]]; then
    passed_journeys=$(wc -l <"$journey_timings" | tr -d ' ')
    printf 'Acceptance: %ss; passed journeys: %s\n' "$acceptance_seconds" "$passed_journeys"
  fi
fi
printf 'Full log: %s\n' "$full_log"
printf 'Reports: %s\n' "$report_directory"

exit "$test_status"
