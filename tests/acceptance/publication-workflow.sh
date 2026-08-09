#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$repo_root/tests/acceptance/helpers.sh"
acceptance_tmp=$(mktemp -d "${TMPDIR:-/tmp}/marcgelpi-publication.XXXXXX")
fixture_content="$acceptance_tmp/content"
invalid_content="$acceptance_tmp/invalid-content"
incomplete_content="$acceptance_tmp/incomplete-content"
invalid_claim_content="$acceptance_tmp/invalid-claim-content"
invalid_general_content="$acceptance_tmp/invalid-general-content"
invalid_section_content="$acceptance_tmp/invalid-section-content"
unreviewed_private_content="$acceptance_tmp/unreviewed-private-content"
incomplete_about_content="$acceptance_tmp/incomplete-about-content"
production_site="$acceptance_tmp/production-site"
preview_site="$acceptance_tmp/preview-site"
invalid_site="$acceptance_tmp/invalid-site"
incomplete_site="$acceptance_tmp/incomplete-site"
invalid_claim_site="$acceptance_tmp/invalid-claim-site"
invalid_general_site="$acceptance_tmp/invalid-general-site"
invalid_section_site="$acceptance_tmp/invalid-section-site"
unreviewed_private_site="$acceptance_tmp/unreviewed-private-site"
incomplete_about_site="$acceptance_tmp/incomplete-about-site"
server_log="$acceptance_tmp/server.log"
server_port=${SITE_PUBLICATION_TEST_PORT:-4174}
production_session="marcgelpi-publication-$$"
preview_session="marcgelpi-preview-$$"
playwright_cli="$repo_root/node_modules/.bin/playwright-cli"

cleanup() {
  "$playwright_cli" --session "$production_session" close >/dev/null 2>&1 || true
  "$playwright_cli" --session "$preview_session" close >/dev/null 2>&1 || true
  acceptance_stop_server
  rm -rf "$acceptance_tmp"
}
trap cleanup EXIT

assert_eval() {
  local session=$1
  shift
  acceptance_assert_eval "$playwright_cli" "$session" "$@"
}

assert_production_rejected() {
  local content_directory=$1
  local destination_directory=$2
  local build_log=$3
  local expected_error=$4
  local failure_message=$5

  if SITE_CONTENT_DIR="$content_directory" \
    bash "$repo_root/scripts/build-production.sh" "$destination_directory" \
    >"$build_log" 2>&1; then
    acceptance_fail "$failure_message"
  fi

  if ! grep --fixed-strings --quiet "$expected_error" "$build_log"; then
    cat "$build_log" >&2
    acceptance_fail "production build was rejected for an unexpected reason; expected $expected_error"
  fi
}

[[ -x "$playwright_cli" ]] || acceptance_fail "Playwright CLI is not installed; run npm ci"

mkdir -p "$fixture_content/work" "$invalid_content/work" "$incomplete_content/work" "$invalid_claim_content/work"
cp -R "$repo_root/content/." "$fixture_content/"
cp -R "$repo_root/content/." "$invalid_content/"
cp -R "$repo_root/content/." "$incomplete_content/"
cp -R "$repo_root/content/." "$invalid_claim_content/"
cp -R "$repo_root/content/." "$invalid_general_content/"
cp -R "$repo_root/content/." "$invalid_section_content/"
cp -R "$repo_root/content/." "$unreviewed_private_content/"
cp -R "$repo_root/content/." "$incomplete_about_content/"
cp "$repo_root/tests/fixtures/publication/approved-case.md" "$fixture_content/work/approved-case.md"
cp "$repo_root/tests/fixtures/publication/review-case.md" "$fixture_content/work/review-case.md"
cp "$repo_root/tests/fixtures/publication/approved-case.md" "$invalid_content/work/approved-case.md"
cp "$repo_root/tests/fixtures/publication/invalid-public-case.md" "$invalid_content/work/invalid-public-case.md"
cp "$repo_root/tests/fixtures/publication/incomplete-approved-case.md" "$incomplete_content/work/incomplete-approved-case.md"
cp "$repo_root/tests/fixtures/publication/invalid-claim-case.md" "$invalid_claim_content/work/invalid-claim-case.md"
cp "$repo_root/tests/fixtures/publication/invalid-public-page.md" "$invalid_general_content/unapproved-page.md"
cp "$repo_root/tests/fixtures/publication/invalid-section.md" "$invalid_section_content/work/_index.md"
cp "$repo_root/tests/fixtures/publication/unreviewed-private-contact-page.md" "$unreviewed_private_content/unreviewed-private-contact.md"
cp "$repo_root/tests/fixtures/publication/incomplete-about.md" "$incomplete_about_content/about/index.md"

mkdir -p "$invalid_site"
printf '%s\n' "PREVIOUS_PUBLICATION_SENTINEL" >"$invalid_site/index.html"

assert_production_rejected \
  "$invalid_content" \
  "$invalid_site" \
  "$acceptance_tmp/invalid-build.log" \
  "cannot be published" \
  "production build accepted editorial content without approval"

if [[ "$(cat "$invalid_site/index.html")" != "PREVIOUS_PUBLICATION_SENTINEL" ]]; then
  acceptance_fail "rejected content changed the previously published site"
fi

assert_production_rejected \
  "$invalid_section_content" \
  "$invalid_section_site" \
  "$acceptance_tmp/invalid-section-build.log" \
  "cannot be published" \
  "production build accepted an unapproved section landing page"

assert_production_rejected \
  "$unreviewed_private_content" \
  "$unreviewed_private_site" \
  "$acceptance_tmp/unreviewed-private-build.log" \
  "requires publication.privacy_reviewed: true" \
  "production build accepted content without an explicit private-contact review"

assert_production_rejected \
  "$incomplete_about_content" \
  "$incomplete_about_site" \
  "$acceptance_tmp/incomplete-about-build.log" \
  "requires career_history_complete: true" \
  "production build accepted About with an incomplete career history"

if [[ -d "$unreviewed_private_site" ]] && grep --recursive --fixed-strings --quiet "private-source@example.invalid" "$unreviewed_private_site"; then
  acceptance_fail "rejected private contact data leaked into generated output"
fi

assert_production_rejected \
  "$invalid_general_content" \
  "$invalid_general_site" \
  "$acceptance_tmp/invalid-general-build.log" \
  "cannot be published" \
  "production build accepted an unapproved page outside the primary editorial sections"

assert_production_rejected \
  "$invalid_claim_content" \
  "$invalid_claim_site" \
  "$acceptance_tmp/invalid-claim-build.log" \
  "unsupported basis" \
  "production build accepted a case claim without an evidence basis"

assert_production_rejected \
  "$incomplete_content" \
  "$incomplete_site" \
  "$acceptance_tmp/incomplete-build.log" \
  "requires publication.reviewed_by" \
  "production build accepted an approved case without its editorial review record"

SITE_CONTENT_DIR="$fixture_content" \
  bash "$repo_root/scripts/build-production.sh" "$production_site" \
  >/dev/null

acceptance_start_server "$production_site" "$server_port" "$server_log"
"$playwright_cli" --session "$production_session" open "http://127.0.0.1:$server_port/work/approved-case/" >/dev/null

assert_eval \
  "$production_session" \
  "approved editorial content is publicly reachable" \
  "document.querySelector('h1')?.textContent.trim()" \
  '"Approved case fixture"'

assert_eval \
  "$production_session" \
  "editorial source-register details are not rendered publicly" \
  "!document.body.textContent.includes('SOURCE_REGISTER_ONLY_SENTINEL')" \
  "true"

assert_eval \
  "$production_session" \
  "review-only content has no public route" \
  "fetch('/work/review-case/').then(response => response.status === 404)" \
  "true"

assert_eval \
  "$production_session" \
  "review-only content is absent from public metadata, listings, feeds, and the homepage" \
  "(async () => { const paths = ['/', '/work/', '/work/index.xml', '/sitemap.xml']; const pages = await Promise.all(paths.map(path => fetch(path).then(response => response.text()))); return pages.every(page => !page.includes('review-case') && !page.includes('REVIEW_ONLY_SOURCE_SENTINEL')); })()" \
  "true"

"$playwright_cli" --session "$production_session" close >/dev/null
acceptance_stop_server

hugo \
  --source "$repo_root" \
  --contentDir "$fixture_content" \
  --destination "$preview_site" \
  --environment development \
  --buildDrafts \
  --quiet

acceptance_start_server "$preview_site" "$server_port" "$server_log"
"$playwright_cli" --session "$preview_session" open "http://127.0.0.1:$server_port/work/review-case/" >/dev/null

assert_eval \
  "$preview_session" \
  "review-only content is available in preview" \
  "document.body.textContent.includes('REVIEW_ONLY_SOURCE_SENTINEL')" \
  "true"

assert_eval \
  "$preview_session" \
  "preview does not expose an editorial status warning to visitors" \
  "document.querySelector('[data-publication-review-banner]') === null" \
  "true"

echo "PASS: safe draft-to-public content workflow"
