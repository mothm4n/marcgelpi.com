#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-writing" "${SITE_WRITING_TEST_PORT:-4179}" "marcgelpi-writing-$$"
trap acceptance_browser_cleanup EXIT

writing_archetype="$acceptance_repo_root/archetypes/writing.md"
[[ -f "$writing_archetype" ]] || acceptance_fail "Writing authoring archetype is missing"
acceptance_contains 'status: "review"' "$writing_archetype" || acceptance_fail "Writing archetype must start in editorial review"
acceptance_contains 'privacy_reviewed: false' "$writing_archetype" || acceptance_fail "Writing archetype must require a privacy review"
if grep -Fq '<!--more-->' "$writing_archetype"; then
  acceptance_fail "Writing archetype opts into Go deeper without an explicit request"
fi

article_content_expression="(() => { const main = document.querySelector('main'); const body = main?.querySelector('.writing-body'); const headings = Array.from(body?.querySelectorAll('h2') ?? []).map(heading => heading.firstChild?.textContent.trim()); const source = body?.querySelector('a[href=\"https://www.oliverburkeman.com/meditationsformortals\"]'); return main?.querySelector('h1')?.textContent.trim() === 'Life isn’t always a river' && main?.querySelector('.writing-article-deck')?.textContent.trim() === 'Product decisions change. That doesn’t always mean they were wrong.' && main?.querySelector('time')?.getAttribute('datetime') === '2026-06-01' && body?.textContent.includes('We want meaning. We want coherence. We want the river to actually mean something.') && headings[0] === 'Why it matters' && headings.at(-1) === 'A useful principle' && source?.textContent.trim() === 'Meditations for Mortals' && main?.querySelector('details, aside, progress, [data-comments], [data-tags], [data-categories], [data-filters], nav[aria-label=\"On this page\"]') === null; })()"

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
[[ -f "$production_site/writing/index.html" ]] || acceptance_fail "approved Writing archive is missing from production"
[[ -f "$production_site/writing/life-isnt-always-a-river/index.html" ]] || acceptance_fail "approved first article is missing from production"
[[ -f "$production_site/writing/index.xml" ]] || acceptance_fail "Writing RSS is missing from production"
[[ ! -e "$production_site/writing/people-first-and-performance/index.html" ]] || acceptance_fail "retired Writing leaked into production"

acceptance_browser_start_and_open "$production_site" "/writing/"
acceptance_browser_assert_eval \
  "the approved Writing archive exposes exactly the first article" \
  "(() => { const main = document.querySelector('main'); const links = Array.from(main?.querySelectorAll('ol a') ?? []); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && links.length === 1 && links[0]?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && links[0]?.querySelector('strong')?.textContent.trim() === 'Life isn’t always a river' && !main?.textContent.includes('Blog'); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/writing/life-isnt-always-a-river/" >/dev/null
acceptance_browser_assert_eval \
  "the approved article preserves its original continuous reading experience" \
  "$article_content_expression" \
  "true"

acceptance_browser_assert_eval \
  "the approved article publishes accurate metadata" \
  "document.title === 'Life isn’t always a river · Marc Gelpí' && document.querySelector('link[rel=canonical]')?.href === 'https://marcgelpi.com/writing/life-isnt-always-a-river/' && document.querySelector('meta[property=\"og:type\"]')?.content === 'article' && document.querySelector('.writing-article-meta')?.textContent.includes('4 min read')" \
  "true"

acceptance_browser_assert_eval \
  "Writing RSS describes the approved article on the canonical domain" \
  "fetch('/writing/index.xml').then(response => response.text()).then(feed => feed.includes('<rss') && feed.includes('<title>Life isn’t always a river</title>') && feed.includes('https://marcgelpi.com/writing/life-isnt-always-a-river/'))" \
  "true"

acceptance_stop_server

fixture_content="$acceptance_browser_tmp/content"
cp -R "$acceptance_repo_root/content/." "$fixture_content/"
cp "$acceptance_repo_root/tests/fixtures/writing/older-article.md" "$fixture_content/writing/older-article.md"
cp "$acceptance_repo_root/tests/fixtures/writing/long-article.md" "$fixture_content/writing/long-article.md"
cp "$acceptance_repo_root/tests/fixtures/writing/long-no-headings.md" "$fixture_content/writing/long-no-headings.md"

for _ in {1..130}; do
  printf '%s\n' "This deliberately long fixture adds enough independent words to cross the editorial threshold and exercise the conditional navigation behavior." >>"$fixture_content/writing/long-article.md"
done

for _ in {1..130}; do
  printf '%s\n' "This deliberately long fixture adds enough independent words to cross the editorial threshold while retaining a single unbroken section." >>"$fixture_content/writing/long-no-headings.md"
done

acceptance_browser_build_preview "$acceptance_browser_site_dir" "$fixture_content"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/writing/"

acceptance_browser_assert_eval \
  "Writing previews the first article without restoring retired content" \
  "(async () => { const main = document.querySelector('main'); const titles = Array.from(main?.querySelectorAll('ol a strong') ?? []).map(title => title.textContent.trim()); const response = await fetch('/writing/people-first-and-performance/'); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && titles[0] === 'Older writing fixture' && titles.includes('Life isn’t always a river') && titles.includes('Long-form writing fixture') && !main?.textContent.includes('People-first is not the opposite of performance') && response.status === 404; })()" \
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

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/writing/life-isnt-always-a-river/" >/dev/null
acceptance_browser_assert_eval \
  "the first article preserves the original continuous reading experience" \
  "$article_content_expression" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "the first article remains readable without mobile overflow" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/writing/long-article/" >/dev/null
acceptance_browser_assert_eval \
  "explicitly layered long Writing receives Go deeper and an on-page table of contents" \
  "(() => { const tocLink = document.querySelector('main nav[aria-label=\"On this page\"] a[href=\"#long-argument\"]'); const depth = document.querySelector('main details > summary'); return tocLink?.textContent.trim() === 'Long argument' && depth?.textContent.trim() === 'Go deeper'; })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/writing/long-no-headings/" >/dev/null
acceptance_browser_assert_eval \
  "long Writing without sections does not receive an empty table of contents" \
  "document.querySelector('main nav[aria-label=\"On this page\"]') === null" \
  "true"

echo "PASS: Writing shelf ready for Marc's next article"
