#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
workflow="$repo_root/.github/workflows/hugo.yaml"
method="$repo_root/.github/publication-performance.md"
summary_script="$repo_root/scripts/summarize-browser-install.sh"
test_tmp=$(mktemp -d "${TMPDIR:-/tmp}/browser-install-test.XXXXXX")
trap 'rm -rf "$test_tmp"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  local text=$1
  local path=$2
  grep --fixed-strings --quiet -- "$text" "$path" || fail "$path does not contain: $text"
}

printf '%s\n' \
  'Downloading FFmpeg (playwright ffmpeg v1011)' \
  '|■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 2.3 MiB' \
  'Downloading Chrome Headless Shell 152.0.7977.8' \
  '|■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■| 100% of 113.9 MiB' \
  >"$test_tmp/install.log"

bash "$summary_script" "$test_tmp/install.log" 100 109 >"$test_tmp/summary.md"
contains '| Before #38 | 28s | 300.9 MiB | Full Chromium, headless shell, and FFmpeg |' "$test_tmp/summary.md"
contains '| Current run | 9s | 116.2 MiB | Headless shell and FFmpeg |' "$test_tmp/summary.md"

contains 'npx playwright install --with-deps --only-shell chromium' "$workflow"
if grep --fixed-strings --quiet 'npx playwright install --with-deps chromium' "$workflow"; then
  fail "workflow still installs full Chromium"
fi
contains 'summarize-browser-install.sh' "$workflow"
contains 'browser:install-headed' "$repo_root/package.json"
contains 'browser:open-headed' "$repo_root/package.json"
contains 'npm run browser:install-headed' "$method"
contains 'npm run browser:open-headed --' "$method"

echo "PASS: Chromium headless-shell installation contract"
