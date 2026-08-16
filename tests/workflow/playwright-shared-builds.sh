#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runner="$repo_root/tests/acceptance/run.sh"
server="$repo_root/scripts/serve-playwright-site.sh"
spec="$repo_root/tests/playwright/public-journeys.spec.js"
fixtures="$repo_root/tests/playwright/fixtures.js"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  local text=$1
  local path=$2
  grep --fixed-strings --quiet -- "$text" "$path" || fail "$path does not contain: $text"
}

[[ -f "$spec" ]] || fail "public Playwright Test journeys are missing"
[[ -f "$fixtures" ]] || fail "isolated-artifact fixture is missing"

for legacy_journey in \
  about-journey \
  anonymized-portfolio \
  contact-journey \
  density-quality \
  home-journey \
  responsive-quality \
  work-journey; do
  [[ ! -e "$repo_root/tests/acceptance/$legacy_journey.sh" ]] || fail "$legacy_journey still runs in the legacy harness"
done

contains 'npx playwright test' "$runner"
contains 'PLAYWRIGHT_BUILD_REPORT' "$runner"
contains 'production=1, preview=1' "$runner"
contains 'scripts/build-production.sh' "$server"
contains '--environment development' "$server"
contains '--buildDrafts' "$server"
contains 'production\t1' "$server"
contains 'preview\t1' "$server"
contains 'createIsolatedArtifact' "$fixtures"

echo "PASS: Playwright Test shared standard-build contract"
