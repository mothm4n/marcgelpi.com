#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
timing_script="$repo_root/scripts/publication-timing.sh"
workflow="$repo_root/.github/workflows/hugo.yaml"
method="$repo_root/.github/publication-performance.md"
test_tmp=$(mktemp -d "${TMPDIR:-/tmp}/publication-timing-test.XXXXXX")
trap 'rm -rf "$test_tmp"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  local text=$1
  local path=$2
  grep --fixed-strings --quiet "$text" "$path" || fail "$path does not contain: $text"
}

timings="$test_tmp/timings.tsv"
bash "$timing_script" record "$timings" "Acceptance" 100 655
bash "$timing_script" record "$timings" "Build" 700 705
bash "$timing_script" render "Publication timing" "$timings" >"$test_tmp/summary.md"

contains '## Publication timing' "$test_tmp/summary.md"
contains '| Acceptance | 9m 15s |' "$test_tmp/summary.md"
contains '| Build | 5s |' "$test_tmp/summary.md"

for phase in \
  'Checkout' \
  'Setup Pages' \
  'Install Hugo' \
  'Setup Node' \
  'Install browser acceptance dependencies' \
  'Acceptance' \
  'Build' \
  'Verify deployable release artifact' \
  'Upload artifact' \
  'Deploy to GitHub Pages' \
  'Total publication'; do
  contains "$phase" "$workflow"
done
contains 'GITHUB_STEP_SUMMARY' "$workflow"

contains '10:19 total' "$method"
contains '9:15 acceptance' "$method"
contains 'below 3:00' "$method"
contains 'immediately before checkout through completed GitHub Pages deployment' "$method"
contains 'one Hugo invocation counted when it starts' "$method"

echo "PASS: publication timing contract"
