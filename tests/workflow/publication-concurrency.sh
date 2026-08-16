#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
workflow="$repo_root/.github/workflows/hugo.yaml"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  local text=$1
  grep --fixed-strings --quiet "$text" "$workflow" || fail "workflow does not contain: $text"
}

contains 'branches:'
contains '      - master'
contains 'workflow_dispatch:'
contains 'group: pages'
contains 'cancel-in-progress: true'
contains 'The desired published state is the latest commit on the publication branch.'
contains 'needs: build'
contains 'name: github-pages'

echo "PASS: latest publication concurrency contract"
