#!/usr/bin/env bash

acceptance_resources_context_expression="(() => { const main = document.querySelector('main'); const introduction = main?.querySelector('.editorial-index-introduction'); const experienceLinks = Array.from(introduction?.querySelectorAll('a') ?? []); const expectedIntroduction = 'This guide is for leaders, OKR champions and people building internal support for change. It helps you explain why a bounded OKR pilot may be worth testing, prepare for objections and make a smaller ask. A full OKR introduction, company-wide rollout, compensation design and underlying strategy or ownership problems need separate work. For related experience, see the Adevinta case on scaling OKR practice and Marc’s wider experience with organizational change.'; const linksAreKeyboardAccessible = experienceLinks.every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }); return main?.querySelector('h1')?.textContent.trim() === 'Resources' && main?.querySelector('.editorial-index-deck')?.textContent.trim() === 'Practical material for leaders and teams working on organizational effectiveness.' && introduction?.textContent.replace(/\\s+/g, ' ').trim() === expectedIntroduction && experienceLinks.map(link => link.textContent.trim()).join('|') === 'the Adevinta case on scaling OKR practice|Marc’s wider experience with organizational change' && experienceLinks.map(link => link.getAttribute('href')).join('|') === '/work/adevinta/|/about/' && linksAreKeyboardAccessible; })()"

acceptance_browser_assert_resources_context() {
  local description=$1

  acceptance_browser_assert_eval "$description" "$acceptance_resources_context_expression" "true"
}
