#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-home" "${SITE_HOME_TEST_PORT:-4185}" "marcgelpi-home-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
acceptance_browser_start_and_open "$production_site" "/"

acceptance_browser_assert_eval \
  "the current approved homepage remains public while the complete revision is reviewed" \
  "Array.from(document.querySelectorAll('main > [data-home-section]')).map(section => section.dataset.homeSection).join('|')" \
  '"hero|selected-work|how-i-work|conversation"'

acceptance_stop_server
acceptance_browser_build_preview "$acceptance_browser_site_dir"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/"

acceptance_browser_assert_eval \
  "the homepage uses the approved descriptor, thesis, and primary actions" \
  "(() => { const hero = document.querySelector('[data-home-section="hero"]'); const actions = Array.from(hero?.querySelectorAll('a') ?? []); return hero?.querySelector('h1')?.textContent.replace(/\\s+/g, ' ').trim() === 'People-First Organizational Effectiveness & Ways of Working Leader' && hero?.textContent.includes('Helping organizations scale without losing the people who make them work') && actions.map(link => link.textContent.replace(/\\s+/g, ' ').trim()).join('|') === 'Explore my work ↘|Start a conversation →' && actions.map(link => link.getAttribute('href')).join('|') === '/work/|/contact/'; })()" \
  "true"

acceptance_browser_assert_eval \
  "the reviewable editorial journey follows the complete section order" \
  "Array.from(document.querySelectorAll('main > [data-home-section]')).map(section => section.dataset.homeSection).join('|')" \
  '"hero|selected-work|how-i-work|latest-writing|selected-resources|conversation"'

acceptance_browser_assert_eval \
  "selected content connects every approved homepage journey" \
  "(() => { const hrefs = new Set(Array.from(document.querySelectorAll('main a')).map(link => link.getAttribute('href'))); return ['/work/adevinta/', '/about/', '/writing/life-isnt-always-a-river/', '/resources/how-to-sell-okrs/', '/contact/'].every(path => hrefs.has(path)) && !hrefs.has('/writing/people-first-and-performance/') && !hrefs.has('/resources/system-diagnosis/'); })()" \
  "true"

acceptance_browser_assert_eval \
  "latest Writing and the editorially selected Resource reuse approved content" \
  "(() => { const writing = document.querySelector('[data-home-section=\"latest-writing\"]'); const resource = document.querySelector('[data-home-section=\"selected-resources\"]'); return writing?.querySelector('a')?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && writing?.querySelector('h2')?.textContent.trim() === 'Latest writing' && writing?.querySelector('h3')?.textContent.trim() === 'Life isn’t always a river' && writing?.textContent.includes('Product decisions change. That doesn’t always mean they were wrong.') && resource?.querySelector('a')?.getAttribute('href') === '/resources/how-to-sell-okrs/' && resource?.querySelector('h2')?.textContent.trim() === 'Selected resources' && resource?.querySelector('h3')?.textContent.trim() === 'How to sell OKRs internally' && resource?.textContent.includes('A practical case for focus, alignment, accountability and ambitious learning'); })()" \
  "true"

acceptance_browser_assert_eval \
  "selected work uses the Adevinta logo and plain sector labels" \
  "(() => { const work = document.querySelector('[data-home-section="selected-work"]'); const logo = work?.querySelector('img[alt="Adevinta"]'); const copy = work?.textContent.replace(/\s+/g, ' ').trim() ?? ''; return logo !== null && copy.includes('Leading global bank') && copy.includes('Fintech') && !/anonymous|anonymized|confidential/i.test(copy); })()" \
  "true"

acceptance_browser_assert_eval \
  "How I work explains the Grounded Theory evidence practice" \
  "(() => { const copy = document.querySelector('[data-home-section="how-i-work"]')?.textContent.replace(/\s+/g, ' ').toLowerCase() ?? ''; return ['grounded theory', 'interviews', 'qualitative', 'recurring patterns', 'first impressions', 'fieldwork', 'hands dirty', 'generalist'].every(term => copy.includes(term)); })()" \
  "true"

acceptance_browser_assert_eval \
  "every homepage and primary-navigation destination is non-empty and public" \
  "(async () => { const links = Array.from(document.querySelectorAll('main a, [data-primary-navigation] a')); return links.every(link => Boolean(link.getAttribute('href'))) && (await Promise.all(links.map(link => fetch(link.pathname).then(response => response.ok)))).every(Boolean); })()" \
  "true"

acceptance_browser_assert_eval \
  "the homepage avoids disallowed positioning and generic interface patterns" \
  "(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const hero = main?.querySelector('[data-home-section="hero"]')?.textContent.toLowerCase() ?? ''; return !hero.includes('wiris') && !/hire me|open to work|framework[- ]installer|motivational coach|ai consultant/.test(copy) && main?.querySelector('[class*="dashboard"], [class*="card-grid"]') === null; })()" \
  "true"

acceptance_browser_assert_eval \
  "the approved homepage photograph is responsive, dimensioned, and useful" \
  "(() => { const picture = document.querySelector('[data-home-section="hero"] picture'); const image = picture?.querySelector('img'); const srcset = picture?.querySelector('source')?.srcset ?? ''; return image?.alt === 'Marc Gelpí smiling during a conversation' && Number(image?.getAttribute('width')) > 0 && Number(image?.getAttribute('height')) > 0 && ['480w', '800w', '1200w'].every(width => srcset.includes(width)); })()" \
  "true"

acceptance_browser_assert_eval \
  "the homepage keeps a logical accessible heading hierarchy" \
  "(() => { const headings = Array.from(document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1); })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null
acceptance_browser_assert_eval \
  "homepage sections use a compact horizontal-screen rhythm" \
  "(() => ['selected-work', 'how-i-work'].every(name => { const section = document.querySelector('[data-home-section=\"' + name + '\"]'); return section && parseFloat(getComputedStyle(section).paddingTop) < 120; }))()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 900 >/dev/null
acceptance_browser_assert_eval \
  "the desktop navigation and hero fit below 900 pixels without clipping the title" \
  "(() => { const header = document.querySelector('.site-header'); const hero = document.querySelector('[data-home-section=\"hero\"]'); const title = hero?.querySelector('h1'); const heroBox = hero?.getBoundingClientRect(); const titleBox = title?.getBoundingClientRect(); return header && heroBox && titleBox && heroBox.bottom < 900 && titleBox.top >= heroBox.top && titleBox.bottom <= heroBox.bottom && getComputedStyle(title).overflow !== 'hidden'; })()" \
  "true"

acceptance_browser_assert_eval \
  "the editorial homepage fits a desktop viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

acceptance_browser_assert_eval \
  "the primary homepage actions expose visible keyboard focus" \
  "(() => Array.from(document.querySelectorAll('[data-home-section="hero"] a')).every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }))()" \
  "true"

acceptance_browser_assert_eval \
  "the new homepage features expose visible keyboard focus" \
  "(() => Array.from(document.querySelectorAll('[data-home-section=\"latest-writing\"] a, [data-home-section=\"selected-resources\"] a')).every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }))()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
acceptance_browser_assert_eval \
  "the editorial homepage fits a mobile viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

acceptance_browser_assert_eval \
  "the new homepage features stack their content for a mobile reader" \
  "(() => ['latest-writing', 'selected-resources'].every(name => { const link = document.querySelector('[data-home-section=\"' + name + '\"] .home-feature-link'); const copy = link?.querySelector('.home-feature-copy'); return link && copy && getComputedStyle(link).gridTemplateColumns.split(' ').length === 2 && copy.getBoundingClientRect().width < link.getBoundingClientRect().width; }))()" \
  "true"

echo "PASS: complete editorial homepage journey"
