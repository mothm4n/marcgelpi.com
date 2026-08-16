#!/usr/bin/env bash

acceptance_writing_orientation_expression="(() => { const main = document.querySelector('main'); const introduction = main?.querySelector('.editorial-index-introduction'); const orientationLink = introduction?.querySelector('a'); const archiveLinks = Array.from(main?.querySelectorAll('ol a') ?? []); const dates = archiveLinks.map(link => link.querySelector('time')?.getAttribute('datetime')); const expectedIntroduction = 'I write about organizational effectiveness and ways of working; alignment, governance and decision-making; and evidence-based organizational change. Start with why changing a product decision does not prove the original choice was wrong.'; orientationLink?.focus(); const focusStyle = orientationLink && getComputedStyle(orientationLink); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && main?.querySelector('.editorial-index-deck')?.textContent.trim() === 'Notes on organizational effectiveness, decisions, and evidence-based change.' && introduction?.textContent.replace(/\\s+/g, ' ').trim() === expectedIntroduction && orientationLink?.textContent.trim() === 'why changing a product decision does not prove the original choice was wrong' && orientationLink?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && document.activeElement === orientationLink && focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0 && archiveLinks.length === 1 && archiveLinks[0]?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && archiveLinks[0]?.querySelector('strong')?.textContent.trim() === 'Life isn’t always a river' && dates.every((date, index) => index === 0 || date <= dates[index - 1]) && main?.querySelector('[data-tags], [data-categories], [data-filters], nav[aria-label=\"Topics\"]') === null && !main?.textContent.includes('Blog'); })()"
acceptance_writing_article_metadata_expression="document.title === 'Life isn’t always a river · Marc Gelpí' && document.querySelector('meta[name=\"description\"]')?.content === 'A changed product decision is not automatically a bad one. See how visible reasoning helps teams distinguish learning from chaos.' && document.querySelector('.writing-article-deck')?.textContent.trim() === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('meta[property=\"og:description\"]')?.content === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('meta[name=\"twitter:description\"]')?.content === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('link[rel=canonical]')?.href === 'https://marcgelpi.com/writing/life-isnt-always-a-river/' && document.querySelector('meta[property=\"og:type\"]')?.content === 'article' && document.querySelector('.writing-article-meta')?.textContent.includes('4 min read')"

acceptance_browser_assert_writing_orientation() {
  local description=$1

  acceptance_browser_assert_eval "$description" "$acceptance_writing_orientation_expression" "true"
}

acceptance_browser_assert_writing_article() {
  local description=$1

  acceptance_browser_assert_writing_article_content \
    "$description: content" \
    "050e9a0176e0a42271a81f9a9cb796056898e589531ffb95e3ad4fbb8eb89761"
  acceptance_browser_assert_eval "$description: metadata" "$acceptance_writing_article_metadata_expression" "true"
}

acceptance_browser_assert_writing_article_content() {
  local description=$1
  local expected_body_hash=${2:-}

  acceptance_browser_assert_eval \
    "$description" \
    "(async () => { const main = document.querySelector('main'); const body = main?.querySelector('.writing-body'); const headings = Array.from(body?.querySelectorAll('h2') ?? []).map(heading => heading.firstChild?.textContent.trim()); const source = body?.querySelector('a[href=\"https://www.oliverburkeman.com/meditationsformortals\"]'); const normalizedBody = body?.textContent.replace(/\\s+/g, ' ').trim() ?? ''; const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedBody)); const bodyHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''); const bodyIsUnchanged = '$expected_body_hash' === '' || bodyHash === '$expected_body_hash'; return main?.querySelector('h1')?.textContent.trim() === 'Life isn’t always a river' && main?.querySelector('.writing-article-deck')?.textContent.trim() === 'Product decisions change. That doesn’t always mean they were wrong.' && main?.querySelector('time')?.getAttribute('datetime') === '2026-06-01' && bodyIsUnchanged && headings[0] === 'Why it matters' && headings.at(-1) === 'A useful principle' && source?.textContent.trim() === 'Meditations for Mortals' && main?.querySelector('details, aside, progress, [data-comments], [data-tags], [data-categories], [data-filters], nav[aria-label=\"On this page\"]') === null; })()" \
    "true"
}
