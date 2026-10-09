#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
workflow="$repo_root/.github/workflows/hugo.yaml"
server="$repo_root/scripts/serve-playwright-site.sh"
digest_script="$repo_root/scripts/release-artifact-digest.js"
release_verifier="$repo_root/scripts/verify-production-release.sh"
publication_docs="$repo_root/docs/publication-workflow.md"
test_tmp=$(mktemp -d "${TMPDIR:-/tmp}/canonical-artifact-test.XXXXXX")
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

[[ -f "$digest_script" ]] || fail "release artifact digest script is missing"
contains 'PLAYWRIGHT_PRODUCTION_ARTIFACT' "$server"
contains 'Refusing non-canonical production artifact' "$server"
contains 'PLAYWRIGHT_PRODUCTION_ARTIFACT: ${{ github.workspace }}/public' "$workflow"
contains 'node scripts/release-artifact-digest.js public' "$workflow"
contains 'Production artifact changed after acceptance' "$workflow"
contains 'Production artifact changed after release verification' "$workflow"
contains 'include-hidden-files: false' "$workflow"
contains 'path: ./public' "$workflow"
contains 'PLAYWRIGHT_PRODUCTION_ARTIFACT="$PWD/public" npm test' "$publication_docs"
contains 'hidden entry would be excluded from upload' "$release_verifier"

build_line=$(grep -n -- '- name: Build canonical production artifact' "$workflow" | cut -d: -f1)
test_line=$(grep -n -- '- name: Test canonical production artifact' "$workflow" | cut -d: -f1)
verify_line=$(grep -n -- '- name: Verify deployable release artifact' "$workflow" | cut -d: -f1)
upload_line=$(grep -n -- '- name: Upload artifact' "$workflow" | cut -d: -f1)
[[ "$build_line" =~ ^[0-9]+$ && "$test_line" =~ ^[0-9]+$ && "$verify_line" =~ ^[0-9]+$ && "$upload_line" =~ ^[0-9]+$ ]] || fail "canonical artifact gates are incomplete"
((build_line < test_line && test_line < verify_line && verify_line < upload_line)) || fail "canonical artifact gates are out of order"

if sed -n "$((test_line + 1)),$((verify_line - 1))p" "$workflow" | grep --fixed-strings --quiet 'build-production.sh'; then
  fail "the production site is rebuilt after browser acceptance starts"
fi

mkdir -p "$test_tmp/not-public" "$test_tmp/digest"
if PLAYWRIGHT_PRODUCTION_ARTIFACT="$test_tmp/not-public" bash "$server" >"$test_tmp/server.log" 2>&1; then
  fail "a fixture-specific directory can be selected as the canonical artifact"
fi
contains 'Refusing non-canonical production artifact' "$test_tmp/server.log"

printf 'alpha\n' >"$test_tmp/digest/a.txt"
printf 'beta\n' >"$test_tmp/digest/b.txt"
initial_digest=$(node "$digest_script" "$test_tmp/digest")
printf 'changed\n' >"$test_tmp/digest/b.txt"
changed_digest=$(node "$digest_script" "$test_tmp/digest")
[[ "$initial_digest" != "$changed_digest" ]] || fail "artifact content changes do not change its digest"

echo "PASS: canonical production artifact contract"
