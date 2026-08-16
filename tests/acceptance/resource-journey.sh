#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
source "$acceptance_directory/contracts/resources.sh"
acceptance_browser_setup "marcgelpi-resource" "${SITE_RESOURCE_TEST_PORT:-4183}" "marcgelpi-resource-$$"
trap acceptance_browser_cleanup EXIT

resource_archetype="$acceptance_repo_root/archetypes/resources.md"
[[ -f "$resource_archetype" ]] || acceptance_fail "Resources authoring archetype is missing"
acceptance_contains 'draft: true' "$resource_archetype" || acceptance_fail "Resources archetype must start as a draft"
acceptance_contains 'status: "review"' "$resource_archetype" || acceptance_fail "Resources archetype must start in editorial review"
acceptance_contains 'privacy_reviewed: false' "$resource_archetype" || acceptance_fail "Resources archetype must require a privacy review"

resource_shelf_expression="(async () => { const main = document.querySelector('main'); const links = Array.from(main?.querySelectorAll('ol a') ?? []); const retired = await fetch('/resources/system-diagnosis/'); return main?.querySelector('h1')?.textContent.trim() === 'Resources' && links.length === 1 && links[0]?.getAttribute('href') === '/resources/how-to-sell-okrs/' && links[0]?.querySelector('strong')?.textContent.trim() === 'How to sell OKRs internally' && !main?.textContent.includes('The 15-minute system diagnosis') && !/coming soon|sign up|subscribe|newsletter|fake download/i.test(main?.textContent ?? '') && retired.status === 404; })()"

fixture_content="$acceptance_browser_tmp/content"
cp -R "$acceptance_repo_root/content/." "$fixture_content/"
cp "$acceptance_repo_root/tests/fixtures/resources/review-resource.md" "$fixture_content/resources/review-resource.md"

production_site="$acceptance_browser_tmp/production-site"
SITE_CONTENT_DIR="$fixture_content" bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
[[ -f "$production_site/resources/index.html" ]] || acceptance_fail "approved Resources shelf is missing from production"
[[ -f "$production_site/resources/how-to-sell-okrs/index.html" ]] || acceptance_fail "approved first resource is missing from production"
[[ -f "$production_site/downloads/how-to-sell-okrs.pdf" ]] || acceptance_fail "downloadable OKR field guide is missing from production"
[[ ! -e "$production_site/resources/system-diagnosis/index.html" ]] || acceptance_fail "retired resource leaked into production"
[[ ! -e "$production_site/resources/review-resource/index.html" ]] || acceptance_fail "review-only resource leaked into production"
[[ ! -e "$production_site/downloads/review-only.pdf" ]] || acceptance_fail "review-only resource download leaked into production"
[[ ! -e "$production_site/images/resources/review-only.jpg" ]] || acceptance_fail "review-only resource image leaked into production"

acceptance_browser_start_and_open "$production_site" "/resources/"
acceptance_browser_assert_eval \
  "the approved Resources shelf exposes exactly the OKR resource" \
  "$resource_shelf_expression" \
  "true"

acceptance_browser_assert_resources_context \
  "the approved Resources context explains the guide and links to relevant experience"

acceptance_browser_assert_eval \
  "the approved Resources context retains its heading structure without desktop overflow" \
  "$acceptance_page_heading_and_overflow_expression" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "the approved Resources context retains its heading structure without mobile overflow" \
  "$acceptance_page_heading_and_overflow_expression" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/resources/how-to-sell-okrs/" >/dev/null
acceptance_browser_assert_eval \
  "the OKR article builds the case through outcomes and useful visuals" \
  "(() => { const main = document.querySelector('main'); const images = Array.from(main?.querySelectorAll('img') ?? []); const headings = Array.from(main?.querySelectorAll('h2') ?? []).map(heading => heading.firstChild?.textContent.trim()); const copy = main?.textContent ?? ''; return main?.querySelector('h1')?.textContent.trim() === 'How to sell OKRs internally' && main?.querySelector('.resource-deck')?.textContent.trim() === 'A practical case for focus, alignment, accountability and ambitious learning — without selling OKRs as a cure-all.' && headings.includes('Do not sell the framework') && headings.includes('Lead with four outcomes') && headings.includes('Make a smaller ask') && ['Focus and commitment', 'Alignment and connection', 'Tracking and accountability', 'Stretch and learning'].every(outcome => copy.includes(outcome)) && images.length === 2 && images.every(image => image.alt.trim().length > 0); })()" \
  "true"

acceptance_browser_assert_eval \
  "the primary action downloads a real English PDF" \
  "(async () => { const links = Array.from(document.querySelectorAll('main a[download][href=\"/downloads/how-to-sell-okrs.pdf\"]')); const response = await fetch('/downloads/how-to-sell-okrs.pdf'); const bytes = new Uint8Array(await response.arrayBuffer()); const signature = String.fromCharCode(...bytes.slice(0, 5)); const structure = new TextDecoder('latin1').decode(bytes); return links.length === 2 && links[0]?.textContent.includes('Download the field guide') && response.ok && response.headers.get('content-type') === 'application/pdf' && signature === '%PDF-' && structure.includes('/StructTreeRoot') && /\/Marked\s+true/.test(structure) && structure.includes('/Lang(en-US)'); })()" \
  "true"

acceptance_stop_server

acceptance_browser_build_preview "$acceptance_browser_site_dir" "$fixture_content"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/resources/"

acceptance_browser_assert_eval \
  "Resources previews reviewable work without restoring retired content" \
  "(async () => { const main = document.querySelector('main'); const titles = Array.from(main?.querySelectorAll('ol a strong') ?? []).map(title => title.textContent.trim()); const retired = await fetch('/resources/system-diagnosis/'); return titles.includes('How to sell OKRs internally') && titles.includes('Review-only resource fixture') && !main?.textContent.includes('The 15-minute system diagnosis') && retired.status === 404; })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/resources/review-resource/" >/dev/null
acceptance_browser_assert_eval \
  "review-only resource and download remain available together in preview" \
  "(async () => { const link = document.querySelector('main a[download][href=\"/downloads/review-only.pdf\"]'); const download = await fetch('/downloads/review-only.pdf'); const image = document.querySelector('main img[src=\"/images/resources/review-only.jpg\"]'); const imageResponse = await fetch('/images/resources/review-only.jpg'); return document.querySelector('main h1')?.textContent.trim() === 'Review-only resource fixture' && link !== null && download.ok && image !== null && imageResponse.ok; })()" \
  "true"

acceptance_browser_assert_eval \
  "the homepage promotes the editorially selected Resource without restoring retired or review-only content" \
  "fetch('/').then(response => response.text()).then(html => html.includes('data-home-section=\"selected-resources\"') && html.includes('/resources/how-to-sell-okrs/') && !html.includes('/resources/system-diagnosis/') && !html.includes('/resources/review-resource/'))" \
  "true"

acceptance_browser_assert_eval \
  "the empty Resources shelf remains accessible and private" \
  "(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); const copy = main?.textContent ?? ''; return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && !/coming soon|sign up|subscribe|newsletter|fake download/i.test(copy) && main?.querySelector('form, input, textarea, iframe') === null; })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
acceptance_browser_assert_eval \
  "the Resources shelf fits a desktop viewport" \
  "$acceptance_page_heading_and_overflow_expression" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "the Resources shelf fits a mobile viewport" \
  "$acceptance_page_heading_and_overflow_expression" \
  "true"

echo "PASS: Resources shelf ready for Marc's next resource"
