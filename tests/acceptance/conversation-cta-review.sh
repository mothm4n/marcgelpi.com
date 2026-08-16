#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
source "$acceptance_directory/contracts/work.sh"
acceptance_browser_setup "marcgelpi-conversation-cta" "${SITE_CONVERSATION_CTA_TEST_PORT:-4197}" "marcgelpi-conversation-cta-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null

conversation_cta_data="$acceptance_repo_root/data/conversation-ctas.yaml"

if acceptance_publication_record_is_approved "$conversation_cta_data" "about"; then
  acceptance_contains "A shared question\?" "$production_site/about/index.html" || \
    acceptance_fail "approved About conversation copy is missing from production"
elif acceptance_contains "A shared question\?" "$production_site/about/index.html"; then
  acceptance_fail "unapproved About conversation copy entered production"
fi

for production_case in adevinta protected-autonomy preparing-to-scale; do
  production_case_page="$production_site/work/$production_case/index.html"
  if acceptance_publication_record_is_approved "$conversation_cta_data" "work"; then
    acceptance_contains "Recognize the pattern\?" "$production_case_page" || \
      acceptance_fail "approved Work conversation copy is missing from $production_case"
  elif acceptance_contains "Recognize the pattern\?" "$production_case_page"; then
    acceptance_fail "unapproved Work conversation copy entered $production_case"
  fi
done

acceptance_browser_build_preview "$acceptance_browser_site_dir"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/about/"

for viewport in "390 844" "1440 1000"; do
  viewport_width=${viewport%% *}
  viewport_height=${viewport##* }
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null

  acceptance_browser_assert_eval \
    "About exposes its reviewable conversation invitation at ${viewport_width}px" \
    "(() => { const article = document.querySelector('.about-shell'); const career = article?.querySelector('.about-career'); const cta = article?.querySelector(':scope > [data-conversation-cta]'); const action = cta?.querySelector('a'); return cta === article?.lastElementChild && career?.nextElementSibling === cta && cta?.querySelector('.eyebrow')?.textContent.trim() === 'A shared question?' && cta?.querySelector('h2')?.textContent.trim() === 'Let’s compare notes.' && cta?.querySelector('[data-conversation-copy]')?.textContent.trim() === 'If something in this story connects with a challenge you’re working through, I’d be glad to hear from you.' && action?.textContent.replace(/\\s+/g, ' ').trim() === 'Start a conversation →' && action?.getAttribute('href') === '/contact/' && career?.querySelector('a[href=\"https://www.linkedin.com/in/gelpi/\"]') !== null && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()" \
    "true"
done

for case_path in /work/adevinta/ /work/protected-autonomy/ /work/preparing-to-scale/; do
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$case_path" >/dev/null

  for viewport in "390 844" "1440 1000"; do
    viewport_width=${viewport%% *}
    viewport_height=${viewport##* }
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null
    acceptance_browser_assert_work_conversation_cta \
      "$case_path exposes the shared reviewable conversation invitation at ${viewport_width}px"
  done
done

echo "PASS: conversation CTAs remain reviewable without bypassing publication approval"
