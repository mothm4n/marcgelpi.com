#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-work" "${SITE_WORK_TEST_PORT:-4177}" "marcgelpi-work-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
[[ -e "$production_site/work/adevinta/index.html" ]] || acceptance_fail "approved Adevinta case is missing from production"
[[ -e "$production_site/work/index.html" ]] || acceptance_fail "approved Work index is missing from production"

acceptance_browser_start_and_open "$production_site" "/work/"

acceptance_browser_assert_eval \
  "Work introduces selected case studies with an accessible Adevinta logo path" \
  "(() => { const heading = document.querySelector('main h1'); const link = document.querySelector('main a[href=\"/work/adevinta/\"]'); const logo = link?.querySelector('img'); return heading?.textContent.trim() === 'Selected case studies' && logo?.getAttribute('alt') === 'Adevinta' && link?.getAttribute('aria-label')?.includes('Adevinta'); })()" \
  "true"

acceptance_browser_assert_eval \
  "the Adevinta path has a visible keyboard focus indicator" \
  "(() => { const link = document.querySelector('main a[href=\"/work/adevinta/\"]'); link?.focus(); const style = link && getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; })()" \
  "true"

for mobile_viewport in "320 800" "390 844"; do
  viewport_width=${mobile_viewport%% *}
  viewport_height=${mobile_viewport##* }
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null

  acceptance_browser_assert_eval \
    "Selected case studies uses the available title width at ${viewport_width}px" \
    "(() => Array.from(document.querySelectorAll('.work-case-list a')).every(link => { const style = getComputedStyle(link); const title = link.querySelector('strong'); const label = link.firstElementChild; const titleWidth = title?.getBoundingClientRect().width ?? 0; return style.gridTemplateColumns.split(' ').length === 2 && getComputedStyle(label).gridColumnEnd === '-1' && titleWidth >= link.getBoundingClientRect().width * 0.7 && link.scrollWidth <= link.clientWidth; }))()" \
    "true"
done

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
acceptance_browser_assert_eval \
  "Selected case studies retains its three-column desktop composition" \
  "Array.from(document.querySelectorAll('.work-case-list a')).every(link => getComputedStyle(link).gridTemplateColumns.split(' ').length === 3)" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/work/adevinta/" >/dev/null

acceptance_browser_assert_eval \
  "the Adevinta case progresses from a marketplace partnership to the European methodology team" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const stages = Array.from(main?.querySelectorAll('.work-case-progression section h2') ?? []).map(heading => heading.textContent.trim()).join('|'); return stages === 'Begin with one marketplace|Build a shared practice in Spain|Coordinate across Europe' && ['motors', 'eight teams', 'less than six months', 'hands-on', 'engineering managers', 'human resources business partner', 'individual and collective', 'make the way of working stick', 'peak', '20%', '60%', 'grounded theory', 'okr', 'two quarters', 'more than 1,000', 'adevinta academy', 'talent acquisition', 'time-to-hire', 'agile methodology team', 'european transformation lead', 'more than 30 agile coaches', 'local context', 'marketplaces'].every(term => copy.includes(term)) && !copy.includes('co-lead'); })()" \
  "true"

acceptance_browser_assert_eval \
  "the Adevinta case carries its logo and centers a three-part summary" \
  "(() => { const logo = document.querySelector('img.work-case-organization-logo'); const summary = document.querySelector('.work-case-summary'); return logo?.getAttribute('alt') === 'Adevinta' && summary?.children.length === 3 && getComputedStyle(summary).gridTemplateColumns.split(' ').length === 3; })()" \
  "true"

acceptance_browser_assert_eval \
  "the case makes collaboration explicit without publishing source-document commentary" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; return ['collaboration', 'co-ownership', 'teams', 'managers', 'executives', 'lateral leadership'].every(term => copy.includes(term)) && !/evidence boundary|approved cv|reference evidence/.test(copy) && main?.querySelector('blockquote, a[href$=\".pdf\"]') === null && !copy.includes('acted alone'); })()" \
  "true"

acceptance_browser_assert_eval \
  "the draft case uses an accessible hierarchy and structured boundaries" \
  "(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); const summary = main?.querySelector('dl[aria-label=\"Case boundaries\"]'); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && summary?.querySelectorAll('dt').length === 3 && summary?.querySelectorAll('dd').length === 3 && Array.from(main?.querySelectorAll('section[aria-labelledby]') ?? []).every(section => document.getElementById(section.getAttribute('aria-labelledby'))); })()" \
  "true"

acceptance_browser_assert_eval \
  "the case avoids inflated outcomes and private or internal material" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; return !/fundraising|due diligence|ipo|revenue|internal screenshot|verbatim quotation|transformation succeeded|single-handedly/.test(copy) && main?.querySelector('iframe, form, [data-internal-artifact]') === null; })()" \
  "true"

acceptance_browser_assert_eval \
  "the Adevinta case closes with the approved contextual conversation invitation" \
  "(() => { const article = document.querySelector('.work-case'); const cta = article?.querySelector(':scope > [data-conversation-cta]'); const actions = Array.from(cta?.querySelectorAll('a') ?? []); return cta === article?.lastElementChild && cta?.querySelector('.eyebrow')?.textContent.trim() === 'Recognize the pattern?' && cta?.querySelector('h2')?.textContent.trim() === 'Does any of this resonate?' && cta?.querySelector('[data-conversation-copy]')?.textContent.trim() === 'Have you seen a similar pattern in your own organization—or a different version of the same challenge? Let’s compare notes.' && actions.map(link => link.textContent.replace(/\\s+/g, ' ').trim()).join('|') === 'Start a conversation →|Back to all work ↖' && actions.map(link => link.getAttribute('href')).join('|') === '/contact/|/work/' && actions.every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
acceptance_browser_assert_eval \
  "the Adevinta case fits a desktop viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "the Adevinta case fits a mobile viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

echo "PASS: Adevinta flagship Work journey"
