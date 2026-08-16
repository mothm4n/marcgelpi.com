#!/usr/bin/env bash

set -euo pipefail

source_directory=${1:?Playwright results directory required}
evidence_directory=${2:?sanitized evidence directory required}

mkdir -p "$evidence_directory"

if [[ -f "$source_directory/failure-summary.tsv" ]]; then
  cp "$source_directory/failure-summary.tsv" "$evidence_directory/failure-summary.tsv"
else
  printf 'journey\tfile\tline\tstatus\tduration_ms\tretry\nacceptance-command\tunknown\t0\tfailed\t0\t0\n' \
    >"$evidence_directory/failure-summary.tsv"
fi

shopt -s nullglob
# Only site-shell is guaranteed to exercise the production artifact exclusively.
# Other suites may visit preview builds containing review-only content, so their
# screenshots, traces, and error contexts must remain inside the CI runner.
for production_result in "$source_directory"/site-shell-*; do
  [[ -d "$production_result" ]] || continue
  destination="$evidence_directory/$(basename "$production_result")"
  mkdir -p "$destination"
  while IFS= read -r -d '' attachment; do
    cp "$attachment" "$destination/$(basename "$attachment")"
  done < <(
    find "$production_result" -maxdepth 1 -type f \
      \( -name '*.zip' -o -name '*.png' -o -name 'error-context.md' \) \
      -print0
  )
done

echo "PASS: sanitized Playwright failure evidence prepared"
