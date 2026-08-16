#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
runner="$repo_root/tests/acceptance/run.sh"
config="$repo_root/playwright.config.js"
package_json="$repo_root/package.json"
package_lock="$repo_root/package-lock.json"
publication_docs="$repo_root/docs/publication-workflow.md"
workflow="$repo_root/.github/workflows/hugo.yaml"
evidence_script="$repo_root/scripts/prepare-playwright-failure-evidence.sh"
reporter="$repo_root/tests/playwright/timing-reporter.js"
test_tmp=$(mktemp -d "${TMPDIR:-/tmp}/playwright-retirement-test.XXXXXX")
trap 'rm -rf "$test_tmp"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  local text=$1
  local file=$2
  grep --fixed-strings --quiet -- "$text" "$file" || fail "$file does not contain: $text"
}

for legacy_file in \
  contact-copy-review.sh \
  conversation-cta-review.sh \
  helpers.sh \
  publication-workflow.sh \
  release-readiness.sh \
  resource-journey.sh \
  seo-backlog-release.sh \
  writing-journey.sh; do
  [[ ! -e "$repo_root/tests/acceptance/$legacy_file" ]] || fail "$legacy_file still belongs to the legacy harness"
done

[[ ! -d "$repo_root/tests/acceptance/contracts" ]] || fail "legacy Bash assertion contracts still exist"

if grep --recursive --fixed-strings --quiet \
  --exclude=playwright-legacy-retirement.sh \
  'playwright-cli' \
  "$repo_root/.github" \
  "$repo_root/scripts" \
  "$repo_root/tests" \
  "$package_json" \
  "$package_lock"; then
  fail "the agent-oriented browser CLI is still referenced"
fi

contains 'npx playwright test' "$runner"
contains "reporter: [['line']" "$config"
contains "screenshot: 'only-on-failure'" "$config"
contains "trace: 'retain-on-failure'" "$config"
if grep --fixed-strings --quiet 'for acceptance_test in' "$runner"; then
  fail "the acceptance runner still discovers legacy shell journeys"
fi
contains '"test": "npm run test:workflow && npm run test:acceptance"' "$package_json"
contains 'Run `npm test`.' "$publication_docs"
contains 'npm test' "$workflow"
contains 'id: acceptance' "$workflow"
contains 'Prepare sanitized browser failure evidence' "$workflow"
contains 'Preserve browser failure evidence' "$workflow"
contains 'uses: actions/upload-artifact@v6' "$workflow"
contains "path: \${{ runner.temp }}/playwright-failure-evidence/" "$workflow"
contains 'retention-days: 7' "$workflow"
contains 'PLAYWRIGHT_FAILURE_SUMMARY' "$runner"
contains 'PLAYWRIGHT_FAILURE_SUMMARY' "$reporter"
contains "path.basename(test.location.file)" "$reporter"
[[ -f "$evidence_script" ]] || fail "sanitized failure-evidence script is missing"

PLAYWRIGHT_FAILURE_SUMMARY="$test_tmp/reporter-summary.tsv" node -e '
  const Reporter = require(process.argv[1]);
  const reporter = new Reporter();
  reporter.onBegin();
  reporter.onTestEnd(
    { title: "Review-only fixture journey", expectedStatus: "passed", location: { file: "/private/editorial-release.spec.js", line: 123 } },
    { status: "failed", duration: 456, retry: 1, error: new Error("REVIEW_ONLY_PRIVATE_SENTINEL") },
  );
' "$reporter"
contains $'review-only-fixture\teditorial-release.spec.js\t123\tfailed\t456\t1' "$test_tmp/reporter-summary.tsv"
if grep --fixed-strings --quiet 'REVIEW_ONLY_PRIVATE_SENTINEL' "$test_tmp/reporter-summary.tsv"; then
  fail "the sanitized reporter copied failure content"
fi

if grep --fixed-strings --quiet 'path: test-results/' "$workflow"; then
  fail "raw Playwright results can leave the preview privacy boundary"
fi

mkdir -p \
  "$test_tmp/results/public-journeys-safe" \
  "$test_tmp/results/site-shell-safe" \
  "$test_tmp/results/editorial-release-sensitive"
printf 'journey\tfile\tline\tstatus\tduration_ms\tretry\n' >"$test_tmp/results/failure-summary.tsv"
printf 'REVIEW_ONLY_PRIVATE_SENTINEL\n' >"$test_tmp/results/public-journeys-safe/trace.zip"
printf 'PUBLIC_SCREENSHOT\n' >"$test_tmp/results/site-shell-safe/test-failed-1.png"
printf 'REVIEW_ONLY_PRIVATE_SENTINEL\n' >"$test_tmp/results/editorial-release-sensitive/trace.zip"
bash "$evidence_script" "$test_tmp/results" "$test_tmp/evidence"
[[ -f "$test_tmp/evidence/failure-summary.tsv" ]] || fail "sanitized failure summary was not preserved"
[[ ! -e "$test_tmp/evidence/public-journeys-safe" ]] || fail "mixed preview journey evidence crossed the privacy boundary"
[[ -f "$test_tmp/evidence/site-shell-safe/test-failed-1.png" ]] || fail "site-shell screenshot was not preserved"
if grep --recursive --fixed-strings --quiet 'REVIEW_ONLY_PRIVATE_SENTINEL' "$test_tmp/evidence"; then
  fail "review-only preview evidence crossed the privacy boundary"
fi

node -e '
  const packageJson = require(process.argv[1]);
  const packageLock = require(process.argv[2]);
  if (packageJson.devDependencies?.["@playwright/cli"]) process.exit(1);
  if (packageLock.packages?.["node_modules/@playwright/cli"]) process.exit(1);
' "$package_json" "$package_lock" || fail "@playwright/cli is still a project dependency"

echo "PASS: legacy acceptance harness retirement contract"
