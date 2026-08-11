#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
source "$acceptance_repo_root/scripts/release-policy.sh"
acceptance_browser_setup "marcgelpi-release" "${SITE_RELEASE_TEST_PORT:-4187}" "marcgelpi-release-$$"
trap acceptance_browser_cleanup EXIT

release_site="$acceptance_browser_tmp/release-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$release_site" >/dev/null
bash "$acceptance_repo_root/scripts/verify-production-release.sh" "$release_site" >/dev/null
cp "$acceptance_repo_root/node_modules/axe-core/axe.min.js" "$release_site/__axe.min.js"

acceptance_browser_start_and_open "$release_site" "/"

paths_to_json() {
  local serialized
  serialized=$(printf '"%s",' "$@")
  printf '[%s]\n' "${serialized%,}"
}

public_paths_json=$(paths_to_json "${release_public_paths[@]}")
hidden_paths_json=$(paths_to_json "${release_hidden_paths[@]}")
article_paths_json=$(paths_to_json \
  "/work/adevinta/" \
  "/work/protected-autonomy/" \
  "/work/preparing-to-scale/" \
  "/writing/life-isnt-always-a-river/" \
  "/resources/how-to-sell-okrs/")
forbidden_pattern_json=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$release_forbidden_artifact_pattern")
axe_audit_expression="(async () => { if (!window.axe) { const source = await fetch('/__axe.min.js').then(response => response.text()); (0, eval)(source); } const results = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'] } }); return results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => violation.id).join('|'); })()"

acceptance_browser_assert_eval \
  "every public page has unique accurate canonical and social metadata" \
  "(async () => { const paths = $public_paths_json; const articlePaths = new Set($article_paths_json); const pages = await Promise.all(paths.map(async path => { const response = await fetch(path); const html = await response.text(); const doc = new DOMParser().parseFromString(html, 'text/html'); const meta = key => Array.from(doc.querySelectorAll('meta')).find(node => node.getAttribute('name') === key || node.getAttribute('property') === key)?.content; return { path, ok: response.ok, lang: doc.documentElement.lang, title: doc.title, description: meta('description'), canonical: doc.querySelector('link[rel=\"canonical\"]')?.href, ogTitle: meta('og:title'), ogDescription: meta('og:description'), ogUrl: meta('og:url'), ogType: meta('og:type'), ogLocale: meta('og:locale'), ogImage: meta('og:image'), twitterCard: meta('twitter:card') }; })); const uniqueTitles = new Set(pages.map(page => page.title)).size === pages.length; const uniqueDescriptions = new Set(pages.map(page => page.description)).size === pages.length; const accurate = pages.every(page => { const expectedType = page.path === '/about/' ? 'profile' : articlePaths.has(page.path) ? 'article' : 'website'; return page.ok && page.lang === 'en' && page.title && page.description && page.canonical === 'https://marcgelpi.com' + page.path && page.ogTitle === page.title && page.ogDescription === page.description && page.ogUrl === page.canonical && page.ogType === expectedType && page.ogLocale === 'en_GB' && page.ogImage?.startsWith('https://marcgelpi.com/') && page.twitterCard === 'summary_large_image'; }); return uniqueTitles && uniqueDescriptions && accurate; })()" \
  "true"

acceptance_browser_assert_eval \
  "release discovery surfaces use the canonical domain" \
  "(async () => { const hiddenPaths = $hidden_paths_json; const [robots, sitemap, cname, feed] = await Promise.all(['/robots.txt', '/sitemap.xml', '/CNAME', '/index.xml'].map(path => fetch(path).then(response => response.ok ? response.text() : ''))); const hiddenContentAbsent = content => hiddenPaths.every(path => !content.includes(path)); return robots.includes('User-agent: *') && robots.includes('Sitemap: https://marcgelpi.com/sitemap.xml') && sitemap.includes('<loc>https://marcgelpi.com/') && hiddenContentAbsent(sitemap) && cname.trim() === 'marcgelpi.com' && feed.includes('<rss') && feed.includes('<channel>') && feed.includes('https://marcgelpi.com/') && hiddenContentAbsent(feed); })()" \
  "true"

acceptance_browser_assert_eval \
  "unfinished and empty sections stay out of the focused V1" \
  "(async () => { const paths = $hidden_paths_json; const responses = await Promise.all(paths.map(path => fetch(path))); return responses.every(response => response.status === 404); })()" \
  "true"

acceptance_browser_assert_eval \
  "the production release contains no disallowed visitor tracking or interface" \
  "(async () => { const paths = $public_paths_json; const html = (await Promise.all(paths.map(path => fetch(path).then(response => response.text())))).join(' '); return !(new RegExp($forbidden_pattern_json, 'i')).test(html); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/404.html" >/dev/null
acceptance_browser_assert_eval \
  "the custom not-found page offers a clear route home" \
  "document.querySelector('main h1')?.textContent.trim() === 'This page is not here.' && Array.from(document.querySelectorAll('main a')).some(link => link.getAttribute('href') === '/' && link.textContent.includes('Back to home'))" \
  "true"

for path in "${release_public_paths[@]}"; do
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$path" >/dev/null
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
  acceptance_browser_assert_eval \
    "$path has valid landmarks, headings, images, and desktop width" \
    "(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return document.querySelector('header, nav, main, footer') && headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && Array.from(document.images).every(image => image.hasAttribute('alt')) && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()" \
    "true"

  acceptance_browser_assert_eval \
    "$path has no serious or critical automated WCAG AA violation on desktop" \
    "$axe_audit_expression" \
    '""'

  "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
  acceptance_browser_assert_eval \
    "$path fits the representative mobile viewport" \
    "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
    "true"

  acceptance_browser_assert_eval \
    "$path has no serious or critical automated WCAG AA violation on mobile" \
    "$axe_audit_expression" \
    '""'
done

echo "PASS: canonical V1 release readiness"
