#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
workflow="$repo_root/.github/workflows/hugo.yaml"
schedule="$repo_root/.github/workflows/scheduled-publication.yaml"
test_tmp=$(mktemp -d "${TMPDIR:-/tmp}/publication-concurrency-test.XXXXXX")
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

contains 'branches:' "$workflow"
contains '      - master' "$workflow"
contains 'workflow_dispatch:' "$workflow"
# Full requests join concurrency immediately, before any delayed decision can
# reverse the order of old and new publication requests.
grep --quiet '^concurrency:' "$workflow" || fail "full requests must enter Pages concurrency before work starts"
contains 'group: pages' "$workflow"
contains 'cancel-in-progress: true' "$workflow"
contains 'needs: build' "$workflow"
contains 'name: github-pages' "$workflow"
contains 'name: Deploy to GitHub Pages' "$workflow"
contains 'name: publication-success-state' "$workflow"
if grep --quiet -E 'schedule:|scheduled-publication.js decide|needs: preflight' "$workflow"; then
  fail "hourly decisions must not be admitted to full-publication concurrency"
fi

[[ -f "$schedule" ]] || fail "the hourly decision workflow is missing"
contains 'schedule:' "$schedule"
contains "cron: '17 * * * *'" "$schedule"
contains 'group: scheduled-publication-check' "$schedule"
contains 'actions: write' "$schedule"
contains 'deployments: read' "$schedule"
contains 'id: decision' "$schedule"
contains 'node scripts/scheduled-publication.js decide' "$schedule"
if grep --quiet -E 'group: pages([[:space:]]|$)|pages: write|id-token: write|build-production.sh|actions/deploy-pages|npm ci' "$schedule"; then
  fail "a skip-only check must never acquire or execute the full-publication unit"
fi

# GitHub runs this step only for publish=true; skip=false dispatches nothing.
request=$(sed -n '/^      - name: Request current publication/,$p' "$schedule")
grep --fixed-strings --quiet "if: \${{ steps.decision.outputs.publish == 'true' }}" <<<"$request" || fail "an unchanged decision must not dispatch a full publication"
grep --fixed-strings --quiet 'GH_TOKEN: ${{ github.token }}' <<<"$request" || fail "publication dispatch must use the repository workflow token"

# Exercise the actual external dispatch command with a stale event SHA. GitHub
# must resolve the current master branch instead of receiving that old commit.
dispatch_command=$(sed -n '/^        run: |/,$p' <<<"$request" | sed '1d; s/^          //')
[[ -n "$dispatch_command" ]] || fail "the publication dispatch command is missing"
mkdir -p "$test_tmp/bin"
cat >"$test_tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
printf '%s\n' "$@" >"${DISPATCH_ARGUMENTS}"
GH
chmod +x "$test_tmp/bin/gh"
PATH="$test_tmp/bin:$PATH" DISPATCH_ARGUMENTS="$test_tmp/dispatch-arguments" \
  GITHUB_REPOSITORY=example/site GITHUB_SHA=old-event-commit GH_TOKEN=fixture-token \
  bash -euo pipefail -c "$dispatch_command"
printf '%s\n' workflow run hugo.yaml --repo example/site --ref master >"$test_tmp/expected-arguments"
cmp --silent "$test_tmp/expected-arguments" "$test_tmp/dispatch-arguments" || fail "a delayed decision must request the current master branch, never its old event revision"

echo "PASS: skip-only checks preserve publications; due checks request current master under complete release concurrency"
