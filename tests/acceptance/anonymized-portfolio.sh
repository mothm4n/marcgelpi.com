#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-portfolio" "${SITE_PORTFOLIO_TEST_PORT:-4178}" "marcgelpi-portfolio-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null

[[ -e "$production_site/work/protected-autonomy/index.html" ]] || acceptance_fail "approved bank case is missing from production"
[[ -e "$production_site/work/preparing-to-scale/index.html" ]] || acceptance_fail "approved fintech case is missing from production"

acceptance_browser_start_and_open "$production_site" "/work/"

acceptance_browser_assert_eval \
  "Work lists both sector cases through neutral public routes" \
  "(() => { const main = document.querySelector('main'); const links = Array.from(main?.querySelectorAll('a') ?? []).map(link => link.getAttribute('href')); const copy = main?.textContent ?? ''; return links.includes('/work/protected-autonomy/') && links.includes('/work/preparing-to-scale/') && copy.includes('Leading global bank') && copy.includes('Fintech') && !/anonymous|anonymized|confidential/i.test(copy); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/work/protected-autonomy/" >/dev/null

acceptance_browser_assert_eval \
  "the bank case presents protected autonomy and a precisely scoped observation" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const stages = Array.from(main?.querySelectorAll('.work-case-progression section h2') ?? []).map(heading => heading.textContent.trim()).join('|'); return stages === 'Create a protected boundary|Experiment as one product team|Describe only what was observed' && ['agile marketing', 'idea to reality', 'opportunity', 'hierarchical', 'protected island', 'autonomy', 'experimentation', 'roughly two weeks', 'under 24 hours', 'scoped pilot'].every(term => copy.includes(term)); })()" \
  "true"

acceptance_browser_assert_eval \
  "the bank case presents feedback plainly and protects every party" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const html = main?.innerHTML.toLowerCase() ?? ''; return ['marc’s contribution', 'collaboration', 'participants reported', 'preferred not to return'].every(term => copy.includes(term)) && !/anonymous|anonymized|confidential|paraphrased here|permission for a verbatim quotation/.test(copy) && main?.querySelector('blockquote, q, img, a[href$=\".pdf\"]') === null && !/imaginbank|caixabank|mckinsey|everis|ntt data/.test(html); })()" \
  "true"

acceptance_browser_assert_eval \
  "the bank case keeps the shared three-part summary centered" \
  "(() => { const summary = document.querySelector('.work-case-summary'); return summary?.children.length === 3 && getComputedStyle(summary).gridTemplateColumns.split(' ').length === 3 && !summary?.textContent.includes('Evidence boundary'); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/work/preparing-to-scale/" >/dev/null

acceptance_browser_assert_eval \
  "the fintech case covers the approved preparation-for-scale contribution" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const stages = Array.from(main?.querySelectorAll('.work-case-progression section h2') ?? []).map(heading => heading.textContent.trim()).join('|'); return stages === 'Preserve what matters|Give product work a lightweight shape|Coordinate across distance' && ['values', 'culture', 'startup identity', 'lightweight product operating model', 'product discovery', 'minimum viable coordination', 'barcelona', 'argentina'].every(term => copy.includes(term)); })()" \
  "true"

acceptance_browser_assert_eval \
  "the fintech case protects identities and avoids downstream attribution" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const html = main?.innerHTML.toLowerCase() ?? ''; return ['marc’s contribution', 'collaboration', 'company leaders', 'external collaborators'].every(term => copy.includes(term)) && !/anonymous|anonymized|confidential|makes no claim about subsequent company outcomes|later result|kintai|singular solving|diana damas|\bcps\b|complex problem solving|due diligence|series a|fundraising|financing|later growth/.test(html) && main?.querySelector('blockquote, q, img, a[href$=\".pdf\"]') === null; })()" \
  "true"

acceptance_browser_assert_eval \
  "the approved sector case remains structurally accessible" \
  "(() => { const main = document.querySelector('main'); const sections = Array.from(main?.querySelectorAll('.work-case-progression section[aria-labelledby]') ?? []); return main?.querySelectorAll('h1').length === 1 && sections.length === 3 && sections.every(section => document.getElementById(section.getAttribute('aria-labelledby'))); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
acceptance_browser_assert_eval \
  "the fintech case fits a desktop viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "the fintech case fits a mobile viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

for case_path in /work/protected-autonomy/ /work/preparing-to-scale/; do
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$case_path" >/dev/null
  acceptance_browser_assert_eval \
    "the approved conversation invitation closes $case_path" \
    "(() => { const article = document.querySelector('.work-case'); const cta = article?.querySelector(':scope > [data-conversation-cta]'); const actions = Array.from(cta?.querySelectorAll('a') ?? []); return cta === article?.lastElementChild && cta?.querySelector('.eyebrow')?.textContent.trim() === 'Recognize the pattern?' && cta?.querySelector('h2')?.textContent.trim() === 'Does any of this resonate?' && cta?.querySelector('[data-conversation-copy]')?.textContent.trim() === 'Have you seen a similar pattern in your own organization—or a different version of the same challenge? Let’s compare notes.' && actions.map(link => link.getAttribute('href')).join('|') === '/contact/|/work/'; })()" \
    "true"
done

echo "PASS: protected sector case portfolio"
