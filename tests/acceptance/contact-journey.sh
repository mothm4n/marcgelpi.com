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

if acceptance_publication_record_is_approved "$acceptance_repo_root/data/contact-actions.yaml" "copy_email"; then
  acceptance_browser_assert_eval \
    "approved secondary contact copy appears in production" \
    "document.querySelector('[data-copy-email]')?.textContent.trim()" \
    '"Copy email"'
else
  acceptance_browser_assert_eval \
    "unapproved secondary contact copy stays outside production" \
    "document.querySelector('[data-copy-email], [data-copy-email-status]') === null && !document.querySelector('main').textContent.includes('Copy email')" \
    "true"
fi

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
