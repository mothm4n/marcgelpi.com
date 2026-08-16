#!/usr/bin/env bash

acceptance_browser_assert_work_conversation_cta() {
  local description=$1

  acceptance_browser_assert_eval \
    "$description" \
    "(() => { const article = document.querySelector('.work-case'); const endings = Array.from(article?.querySelectorAll(':scope > [data-conversation-cta]') ?? []); const cta = endings[0]; const actions = Array.from(cta?.querySelectorAll('a') ?? []); const allCaseLinks = Array.from(article?.querySelectorAll('a') ?? []); return endings.length === 1 && cta === article?.lastElementChild && cta?.querySelector('.eyebrow')?.textContent.trim() === 'Recognize the pattern?' && cta?.querySelector('h2')?.textContent.trim() === 'Does any of this resonate?' && cta?.querySelector('[data-conversation-copy]')?.textContent.trim() === 'Have you seen a similar pattern in your own organization—or a different version of the same challenge? Let’s compare notes.' && actions.map(link => link.textContent.replace(/\\s+/g, ' ').trim()).join('|') === 'Start a conversation →|Back to all work ↖' && actions.map(link => link.getAttribute('href')).join('|') === '/contact/|/work/' && allCaseLinks.length === 2 && allCaseLinks.every((link, index) => link === actions[index]) && actions.every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }); })()" \
    "true"
}
