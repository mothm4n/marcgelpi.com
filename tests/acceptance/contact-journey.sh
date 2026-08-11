#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-contact" "${SITE_CONTACT_TEST_PORT:-4175}" "marcgelpi-contact-$$"
trap acceptance_browser_cleanup EXIT

bash "$acceptance_repo_root/scripts/build-production.sh" "$acceptance_browser_site_dir" >/dev/null
acceptance_start_server "$acceptance_browser_site_dir" "$acceptance_browser_server_port" "$acceptance_browser_server_log"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/contact/" >/dev/null

acceptance_browser_assert_eval \
  "Contact presents the public email as its primary action" \
  "document.querySelector('main a[href=\"mailto:hello@marcgelpi.com\"]')?.getAttribute('aria-label')" \
  '"Email Marc at hello@marcgelpi.com"'

acceptance_browser_assert_eval \
  "Contact exposes an accessible secondary copy-email action" \
  "(() => { const address = document.querySelector('[data-contact-email-address]'); const button = document.querySelector('[data-copy-email]'); const status = document.querySelector('[data-copy-email-status]'); button?.focus(); const style = button && getComputedStyle(button); return address?.textContent.trim() === 'hello@marcgelpi.com' && getComputedStyle(address).userSelect !== 'none' && button?.type === 'button' && button.textContent.trim() === 'Copy email' && document.activeElement === button && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && status?.getAttribute('role') === 'status' && status?.getAttribute('aria-live') === 'polite'; })()" \
  "true"

acceptance_browser_assert_eval \
  "copy-email success is announced without moving focus" \
  "(async () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedEmail = value; } } }); const button = document.querySelector('[data-copy-email]'); button.focus(); button.click(); await new Promise(resolve => setTimeout(resolve, 0)); return window.__copiedEmail === 'hello@marcgelpi.com' && document.querySelector('[data-copy-email-status]')?.textContent.trim() === 'Email copied' && document.activeElement === button; })()" \
  "true"

acceptance_browser_assert_eval \
  "copy-email failure leaves a clear manual-copy recovery path" \
  "(async () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); const button = document.querySelector('[data-copy-email]'); button.focus(); button.click(); await new Promise(resolve => setTimeout(resolve, 0)); return document.querySelector('[data-copy-email-status]')?.textContent.trim() === 'Copy unavailable. Select and copy hello@marcgelpi.com manually.' && document.querySelector('[data-contact-email-address]')?.textContent.trim() === 'hello@marcgelpi.com' && document.activeElement === button; })()" \
  "true"

acceptance_browser_assert_eval \
  "Contact uses the confirmed LinkedIn and GitHub destinations" \
  "Array.from(document.querySelectorAll('main a[href^=\"https://\"]')).map(link => link.href).join('|')" \
  '"https://www.linkedin.com/in/gelpi/|https://github.com/mothm4n"'

acceptance_browser_assert_eval \
  "the footer repeats the confirmed social destinations" \
  "Array.from(document.querySelectorAll('footer a[href^=\"https://\"]')).map(link => link.href).join('|')" \
  '"https://www.linkedin.com/in/gelpi/|https://github.com/mothm4n"'

acceptance_browser_assert_eval \
  "social profiles remain outside the primary header" \
  "Array.from(document.querySelectorAll('header a')).every(link => !/linkedin\\.com|github\\.com/.test(link.href))" \
  "true"

acceptance_browser_assert_eval \
  "Contact invites the approved kinds of conversation without job-seeking language" \
  "(() => { const copy = document.querySelector('main')?.textContent.toLowerCase() ?? ''; return ['organizational challenge', 'speaking', 'teaching', 'professional conversation'].every(term => copy.includes(term)) && !/open to work|hire me|looking for a role|job opportunity/.test(copy); })()" \
  "true"

acceptance_browser_assert_eval \
  "Contact introduces no form, booking embed, analytics, or cookie behavior" \
  "document.querySelector('form, iframe') === null && Array.from(document.scripts).every(script => !/analytics|gtag|googletagmanager|calendly|hubspot/i.test(script.src)) && document.cookie === ''" \
  "true"

acceptance_browser_assert_eval \
  "every contact action has a meaningful accessible name" \
  "Array.from(document.querySelectorAll('main a, footer a')).every(link => (link.getAttribute('aria-label') || link.textContent).trim().length >= 6)" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null

acceptance_browser_assert_eval \
  "Contact fits a desktop viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

acceptance_browser_assert_eval \
  "the primary email action has a visible keyboard focus indicator" \
  "(() => { const link = document.querySelector('main a[href=\"mailto:hello@marcgelpi.com\"]'); link?.focus(); const style = link && getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; })()" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null

acceptance_browser_assert_eval \
  "Contact fits a mobile viewport" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

acceptance_browser_assert_eval \
  "the social actions remain keyboard-focusable on mobile" \
  "(() => { const links = Array.from(document.querySelectorAll('main a[href^=\"https://\"]')); return links.length === 2 && links.every(link => { link.focus(); return document.activeElement === link; }); })()" \
  "true"

echo "PASS: privacy-first Contact journey"
