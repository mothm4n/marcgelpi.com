#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-about" "${SITE_ABOUT_TEST_PORT:-4176}" "marcgelpi-about-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
[[ -e "$production_site/about/index.html" ]] || acceptance_fail "approved About page is missing from production"
acceptance_start_server "$production_site" "$acceptance_browser_server_port" "$acceptance_browser_server_log"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/about/" >/dev/null

acceptance_browser_assert_eval \
  "About explains Marc's story and connected way of working" \
  "(() => { const copy = document.querySelector('main')?.textContent.toLowerCase() ?? ''; return ['people-first', 'lateral leadership', 'evidence', 'strategy', 'product', 'technology', 'business', 'practical execution', 'coaching'].every(term => copy.includes(term)); })()" \
  "true"

acceptance_browser_assert_eval \
  "About presents Marc's exact CV values and verified CliftonStrengths profile" \
  "(() => { const heading = document.querySelector('#principles-title'); const values = Array.from(document.querySelectorAll('[data-about-values] li')).map(item => item.textContent.trim()).join('|'); const strengths = Array.from(document.querySelectorAll('[data-about-strengths] li')); const titles = strengths.map(item => item.querySelector('h3')?.textContent.trim()).join('|'); const descriptions = strengths.map(item => item.querySelector('p')?.textContent.trim()).join('|'); return heading?.tagName === 'H2' && heading.textContent.trim() === 'Guiding how I work and create impact:' && values === 'Always people first|Transparency & trust by default|Always believe that we can do things differently|That everything you do adds value|Actions speak louder than words|Always align what I think&feel, what I say and what I do' && strengths.length === 5 && titles === 'Relator|Strategic|Analytical|Ideation|Individualization' && descriptions === 'I build trust through close, genuine relationships and do my best work when people can rely on one another.|I quickly spot relevant patterns, compare alternative paths, and choose a practical way forward.|I test assumptions against evidence, looking for causes and the factors that can change a situation.|I connect ideas that may appear unrelated and use those connections to create useful possibilities.|I notice what is distinctive in each person and shape roles and collaboration around how people do their best work.' && document.querySelector('[data-cliftonstrengths-source], .skip-link') === null; })()" \
  "true"

acceptance_browser_assert_eval \
  "the focused coaching chronology and earlier-role bridge are semantic and complete" \
  "(() => { const section = document.querySelector('section[aria-labelledby=\"career-title\"]'); const entries = Array.from(section?.querySelectorAll('ol > li') ?? []); const organizations = entries.map(entry => entry.querySelector('h3')?.textContent.trim()).join('|'); const earlier = section?.querySelector('[data-earlier-career]'); const linkedin = earlier?.querySelector('a[href=\"https://www.linkedin.com/in/gelpi/\"]'); return entries.length === 6 && organizations === 'WIRIS|Independent professional|Adevinta Group|Adevinta Spain|Holaluz|NTT DATA Europe & Latam' && entries.every(entry => entry.querySelector('time[datetime]')) && ['development', 'product', 'leadership'].every(term => earlier?.textContent.toLowerCase().includes(term)) && linkedin?.textContent.includes('LinkedIn'); })()" \
  "true"

acceptance_browser_assert_eval \
  "the Adevinta Spain role matches the LinkedIn CV" \
  "(() => { const entries = Array.from(document.querySelectorAll('section[aria-labelledby=\"career-title\"] ol > li')); const adevintaSpain = entries.find(entry => entry.querySelector('h3')?.textContent.trim() === 'Adevinta Spain'); return adevintaSpain?.querySelector('.career-role')?.textContent.trim() === 'Business Agile Coach'; })()" \
  "true"

acceptance_browser_assert_eval \
  "career periods expose their start and end months semantically" \
  "(() => { const entries = Array.from(document.querySelectorAll('section[aria-labelledby=\"career-title\"] ol > li')); const current = entries[0]?.querySelector('.career-period'); const closed = entries[2]?.querySelector('.career-period'); return current?.querySelectorAll('time').length === 1 && current?.querySelector('time')?.textContent.trim() === 'September 2025' && current?.textContent.includes('Current') && closed?.querySelectorAll('time').length === 2 && Array.from(closed.querySelectorAll('time')).map(time => time.textContent.trim()).join('|') === 'January 2024|April 2025'; })()" \
  "true"

acceptance_browser_assert_eval \
  "WIRIS is bounded as current work and Holaluz stays in the chronology" \
  "(() => { const entries = Array.from(document.querySelectorAll('section[aria-labelledby=\"career-title\"] ol > li')); const wiris = entries.find(entry => entry.querySelector('h3')?.textContent.trim() === 'WIRIS')?.textContent.toLowerCase() ?? ''; const holaluz = entries.find(entry => entry.querySelector('h3')?.textContent.trim() === 'Holaluz'); return ['agile tech lead', 'current', 'strategy', 'product', 'engineering', 'commercial', 'okrs', 'flow', 'ownership', 'operating model', 'lateral leadership'].every(term => wiris.includes(term)) && !/%|metric|completed transformation|transformation succeeded|improved by|increased by/.test(wiris) && holaluz !== undefined && holaluz.querySelector('a') === null; })()" \
  "true"

acceptance_browser_assert_eval \
  "the approved About photograph is responsive, dimensioned, and meaningfully described" \
  "(() => { const picture = document.querySelector('main picture'); const image = picture?.querySelector('img'); const srcset = picture?.querySelector('source')?.srcset ?? ''; return image?.alt === 'Marc Gelpí in conversation beneath the roof of a Barcelona market' && Number(image?.getAttribute('width')) > 0 && Number(image?.getAttribute('height')) > 0 && ['480w', '800w', '1200w'].every(width => srcset.includes(width)); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
acceptance_browser_assert_eval \
  "values follow the reference's three-by-two desktop composition" \
  "(() => { const list = document.querySelector('[data-about-values]'); const style = getComputedStyle(list); return style.gridAutoFlow === 'column' && style.gridTemplateColumns.split(' ').length === 2 && style.gridTemplateRows.split(' ').length === 3; })()" \
  "true"

acceptance_browser_assert_eval \
  "About fits a desktop viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "values return to their exact linear order on mobile" \
  "(() => { const list = document.querySelector('[data-about-values]'); const style = getComputedStyle(list); return style.gridAutoFlow === 'row' && style.gridTemplateColumns.split(' ').length === 1; })()" \
  "true"

acceptance_browser_assert_eval \
  "About fits a mobile viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

acceptance_browser_assert_eval \
  "About keeps its HTML hierarchy accessible and private" \
  "(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); const hierarchyIsValid = headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1); const copy = main?.textContent ?? ''; return hierarchyIsValid && main?.querySelector('a[href^=\"tel:\"], a[href$=\".pdf\"]') === null && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(copy) && !/\\+\\d[\\d .()-]{7,}/.test(copy); })()" \
  "true"

echo "PASS: evidence-led About journey"
