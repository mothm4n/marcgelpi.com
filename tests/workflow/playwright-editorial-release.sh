#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runner="$repo_root/tests/acceptance/run.sh"
server="$repo_root/scripts/serve-playwright-site.sh"
spec="$repo_root/tests/playwright/editorial-release.spec.js"
fixtures="$repo_root/tests/playwright/fixtures.js"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  local text=$1
  local file=$2
  grep --fixed-strings --quiet -- "$text" "$file" || fail "$file does not contain: $text"
}

[[ -f "$spec" ]] || fail "editorial and release Playwright Test journeys are missing"

contains 'PLAYWRIGHT_ARTIFACT_REPORT' "$runner"
contains 'PLAYWRIGHT_FIXTURE_BUILD_REPORT' "$runner"
contains 'Playwright fixture builds' "$runner"
contains 'PLAYWRIGHT_ARTIFACT_REPORT' "$server"
contains 'createContentFixture' "$fixtures"
contains 'createIsolatedArtifact' "$fixtures"
contains 'expectProductionRejection' "$fixtures"

for journey in \
  'Contact copy review journey' \
  'Conversation CTA review journey' \
  'Publication workflow journey' \
  'Release readiness journey' \
  'Resources journey' \
  'SEO backlog release journey' \
  'Writing journey'; do
  contains "test('$journey'" "$spec"
done

echo "PASS: Playwright Test editorial and release migration contract"
