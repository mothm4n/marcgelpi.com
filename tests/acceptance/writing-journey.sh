#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-writing" "${SITE_WRITING_TEST_PORT:-4179}" "marcgelpi-writing-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
[[ ! -e "$production_site/writing/index.html" ]] || acceptance_fail "hidden Writing shelf leaked into production"
[[ ! -e "$production_site/writing/people-first-and-performance/index.html" ]] || acceptance_fail "retired Writing leaked into production"

fixture_content="$acceptance_browser_tmp/content"
cp -R "$acceptance_repo_root/content/." "$fixture_content/"
cp "$acceptance_repo_root/tests/fixtures/writing/older-article.md" "$fixture_content/writing/older-article.md"
cp "$acceptance_repo_root/tests/fixtures/writing/long-article.md" "$fixture_content/writing/long-article.md"

for _ in {1..130}; do
  printf '%s\n' "This deliberately long fixture adds enough independent words to cross the editorial threshold and exercise the conditional navigation behavior." >>"$fixture_content/writing/long-article.md"
done

acceptance_browser_build_preview "$acceptance_browser_site_dir" "$fixture_content"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/writing/"

acceptance_browser_assert_eval \
  "Writing no longer exposes the retired article" \
  "(async () => { const main = document.querySelector('main'); const titles = Array.from(main?.querySelectorAll('ol a strong') ?? []).map(title => title.textContent.trim()).join('|'); const response = await fetch('/writing/people-first-and-performance/'); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && titles === 'Older writing fixture|Long-form writing fixture' && !main?.textContent.includes('People-first is not the opposite of performance') && response.status === 404; })()" \
  "true"

acceptance_browser_assert_eval \
  "the current homepage does not promote retired Writing" \
  "fetch('/').then(response => response.text()).then(html => !html.includes('/writing/people-first-and-performance/') && !html.includes('data-home-section=\"latest-writing\"'))" \
  "true"

acceptance_browser_assert_eval \
  "the Writing shelf remains accessible and responsive" \
  "(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/writing/older-article/" >/dev/null
acceptance_browser_assert_eval \
  "short future Writing remains structurally quiet" \
  "(() => { const main = document.querySelector('main'); return main?.querySelector('h1')?.textContent.trim() === 'Older writing fixture' && main?.querySelector('article nav[aria-label=\"On this page\"], article aside, progress, [data-comments], [data-tags], [data-categories], [data-filters]') === null; })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "future Writing remains readable without mobile overflow" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/writing/long-article/" >/dev/null
acceptance_browser_assert_eval \
  "genuinely long future Writing receives an on-page table of contents" \
  "document.querySelector('main nav[aria-label=\"On this page\"] a[href=\"#long-argument\"]')?.textContent.trim()" \
  '"Long argument"'

echo "PASS: Writing shelf ready for Marc's next article"
