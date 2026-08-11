#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-contact-copy-review" "${SITE_CONTACT_COPY_REVIEW_TEST_PORT:-4198}" "marcgelpi-contact-copy-review-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null

contact_actions_data="$acceptance_repo_root/data/contact-actions.yaml"
if acceptance_publication_record_is_approved "$contact_actions_data" "copy_email"; then
  acceptance_contains "Copy email" "$production_site/contact/index.html" || \
    acceptance_fail "approved copy-email action is missing from production"
elif acceptance_contains "Copy email|Email copied|Copy unavailable" "$production_site"; then
  acceptance_fail "unapproved contact action entered the production artifact"
fi

acceptance_browser_build_preview "$acceptance_browser_site_dir"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/contact/"

acceptance_browser_assert_eval \
  "review builds expose an accessible secondary copy-email action" \
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

echo "PASS: copy-email action remains reviewable without bypassing publication approval"
