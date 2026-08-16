#!/usr/bin/env bash

set -euo pipefail

install_log=${1:?install log required}
started_at=${2:?start time required}
finished_at=${3:?finish time required}

fail() {
  echo "Browser installation summary error: $1" >&2
  exit 2
}

[[ -f "$install_log" ]] || fail "install log does not exist"
[[ "$started_at" =~ ^[0-9]+$ ]] || fail "start time is not an integer"
[[ "$finished_at" =~ ^[0-9]+$ ]] || fail "finish time is not an integer"
((finished_at >= started_at)) || fail "finish time precedes start time"

if grep --fixed-strings --quiet 'Downloading Chrome for Testing' "$install_log"; then
  fail "full Chromium was downloaded"
fi
grep --fixed-strings --quiet 'Downloading Chrome Headless Shell' "$install_log" || \
  fail "headless shell download is missing"
grep --fixed-strings --quiet 'Downloading FFmpeg' "$install_log" || \
  fail "FFmpeg download is missing"

download_mib=$(awk '
  {
    for (field = 3; field <= NF; field += 1) {
      if ($field == "MiB" && $(field - 2) == "of") {
        total += $(field - 1)
      }
    }
  }
  END { printf "%.1f", total }
' "$install_log")

printf '## Browser setup comparison\n\n'
printf '| Measurement | Duration | Browser download | Installed for CI |\n'
printf '| --- | ---: | ---: | --- |\n'
printf '| Before #38 | 28s | 300.9 MiB | Full Chromium, headless shell, and FFmpeg |\n'
printf '| Current run | %ss | %s MiB | Headless shell and FFmpeg |\n' \
  "$((finished_at - started_at))" \
  "$download_mib"
