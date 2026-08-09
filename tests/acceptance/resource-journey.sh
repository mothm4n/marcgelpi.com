#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-resource" "${SITE_RESOURCE_TEST_PORT:-4183}" "marcgelpi-resource-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
[[ ! -e "$production_site/resources/index.html" ]] || acceptance_fail "hidden Resources shelf leaked into production"
[[ ! -e "$production_site/resources/system-diagnosis/index.html" ]] || acceptance_fail "retired resource leaked into production"

acceptance_browser_build_preview "$acceptance_browser_site_dir"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/resources/"

acceptance_browser_assert_eval \
  "Resources no longer exposes the retired system diagnosis" \
  "(async () => { const main = document.querySelector('main'); const response = await fetch('/resources/system-diagnosis/'); return main?.querySelector('h1')?.textContent.trim() === 'Resources' && main?.querySelector('ol a') === null && !main?.textContent.includes('The 15-minute system diagnosis') && response.status === 404; })()" \
  "true"

acceptance_browser_assert_eval \
  "the current homepage does not promote the retired resource" \
  "fetch('/').then(response => response.text()).then(html => !html.includes('/resources/system-diagnosis/') && !html.includes('data-home-section=\"selected-resources\"'))" \
  "true"

acceptance_browser_assert_eval \
  "the empty Resources shelf remains accessible and private" \
  "(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); const copy = main?.textContent ?? ''; return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && !/coming soon|sign up|subscribe|newsletter|fake download/i.test(copy) && main?.querySelector('form, input, textarea, iframe') === null; })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
acceptance_browser_assert_eval \
  "the Resources shelf fits a desktop viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "the Resources shelf fits a mobile viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

echo "PASS: Resources shelf ready for Marc's next resource"
