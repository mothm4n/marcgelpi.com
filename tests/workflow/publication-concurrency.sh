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
  local path=$2
  grep --fixed-strings --quiet -- "$text" "$path" || fail "$path does not contain: $text"
}

contains 'branches:' "$workflow"
contains '      - master' "$workflow"
contains 'workflow_dispatch:' "$workflow"
contains 'schedule:' "$workflow"
contains "cron: '17 * * * *'" "$workflow"

# GitHub admits concurrency before steps run and replaces pending members too.
# A decision that skips publication must never enter the Pages group.
if grep --quiet '^concurrency:' "$workflow"; then
  fail "a skip-only hourly check can cancel an active or pending publication"
fi
preflight=$(sed -n '/^  preflight:/,/^  publication:/p' "$workflow")
if grep --quiet 'concurrency:' <<<"$preflight"; then
  fail "preflight must finish before entering publication concurrency"
fi
publication=$(sed -n '/^  publication:/,$p' "$workflow")
grep --fixed-strings --quiet 'needs: preflight' <<<"$publication" || fail "publication must wait for its decision"
grep --fixed-strings --quiet "if: \${{ needs.preflight.outputs.publish == 'true' }}" <<<"$publication" || fail "skip-only runs must not enter publication concurrency"
grep --fixed-strings --quiet 'group: pages' <<<"$publication" || fail "real publications must share the Pages group"
grep --fixed-strings --quiet 'cancel-in-progress: true' <<<"$publication" || fail "a newer real publication must replace the previous publication"
[[ $(grep --count 'concurrency:' "$workflow") == 1 ]] || fail "only the complete publication unit may own concurrency"

# One concurrency unit must retain the entire build-to-deployment sequence.
release_path=$(sed -n 's@^    uses: \(\./\.github/workflows/[^ ]*\)$@\1@p' <<<"$publication")
[[ -n "$release_path" && -f "$repo_root/$release_path" ]] || fail "publication must call its complete local release workflow"
release_workflow="$repo_root/$release_path"
contains 'workflow_call:' "$release_workflow"
contains 'shell: bash' "$release_workflow"
contains 'pages: write' "$release_workflow"
contains 'id-token: write' "$release_workflow"
contains '  build:' "$release_workflow"
contains '  deploy:' "$release_workflow"
contains 'needs: build' "$release_workflow"
contains 'name: github-pages' "$release_workflow"
contains 'name: Deploy to GitHub Pages' "$release_workflow"
contains 'name: publication-success-state' "$release_workflow"
if grep --quiet 'concurrency:' "$release_workflow"; then
  fail "build and deployment must not compete with their enclosing publication lock"
fi

echo "PASS: skip-only checks preserve active and pending publications; newer real publications replace the complete release"
