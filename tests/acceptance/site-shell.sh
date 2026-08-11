#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-shell" "${SITE_TEST_PORT:-4173}" "marcgelpi-shell-$$"
trap acceptance_browser_cleanup EXIT

hugo \
  --source "$acceptance_repo_root" \
  --destination "$acceptance_browser_site_dir" \
  --gc \
  --minify \
  --quiet

acceptance_start_server "$acceptance_browser_site_dir" "$acceptance_browser_server_port" "$acceptance_browser_server_log"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/" >/dev/null

acceptance_browser_assert_eval \
  "site language is English" \
  "document.documentElement.lang" \
  '"en"'

acceptance_browser_assert_eval \
  "primary navigation matches the V1 information architecture" \
  "Array.from(document.querySelectorAll('[data-primary-navigation] a')).map(link => link.textContent.trim()).join('|')" \
  '"Home|Work|About|Writing|Contact"'

acceptance_browser_assert_eval \
  "every primary destination is served" \
  "(async () => (await Promise.all(Array.from(document.querySelectorAll('[data-primary-navigation] a')).map(link => fetch(link.pathname).then(response => response.ok)))).every(Boolean))()" \
  "true"

acceptance_browser_assert_eval \
  "public search and language controls are absent" \
  "document.querySelector('[data-site-search], [data-language-selector]') === null" \
  "true"

acceptance_browser_assert_eval \
  "the public shell uses semantic landmarks" \
  "['header', 'nav', 'main', 'footer'].every(selector => document.querySelector(selector) !== null)" \
  "true"

acceptance_browser_assert_eval \
  "the canonical homepage uses the production domain" \
  "document.querySelector('link[rel=canonical]')?.href" \
  '"https://marcgelpi.com/"'

acceptance_browser_assert_eval \
  "the public identity preserves Marc Gelpí's name and monogram" \
  "(() => { const mark = document.querySelector('.site-mark'); const footer = document.querySelector('.footer-mark'); return document.title === 'Marc Gelpí' && mark?.getAttribute('aria-label') === 'Marc Gelpí, home' && mark?.textContent.trim() === 'MG' && footer?.textContent.trim() === 'Marc Gelpí'; })()" \
  "true"

acceptance_browser_assert_eval \
  "the MG favicon is declared and publicly served" \
  "(async () => { const icon = document.querySelector('link[rel~="icon"]'); return icon?.getAttribute('href') === '/favicon.svg' && (await fetch(icon.href)).ok; })()" \
  "true"

acceptance_browser_assert_eval \
  "the active destination is exposed to assistive technology" \
  "document.querySelector('[data-primary-navigation] a[aria-current=page]')?.textContent.trim()" \
  '"Home"'

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null

acceptance_browser_assert_eval \
  "the desktop shell does not overflow horizontally" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" reload >/dev/null
"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null

acceptance_browser_assert_eval \
  "desktop navigation is reachable by keyboard" \
  "document.activeElement?.textContent.trim()" \
  '"Home"'

"$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null
"$acceptance_playwright_cli" --session "$acceptance_browser_session" reload >/dev/null

acceptance_browser_assert_eval \
  "the mobile shell does not overflow horizontally" \
  "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
  "true"

acceptance_browser_assert_eval \
  "mobile navigation remains available" \
  "getComputedStyle(document.querySelector('[data-mobile-navigation]')).display !== 'none'" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null

acceptance_browser_assert_eval \
  "the mobile menu control is reachable by keyboard" \
  "document.activeElement?.textContent.replace(/\\s+/g, ' ').trim()" \
  '"Menu ↘"'

"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Enter >/dev/null

acceptance_browser_assert_eval \
  "the mobile menu opens from the keyboard" \
  "document.querySelector('[data-mobile-navigation]').open" \
  "true"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null

acceptance_browser_assert_eval \
  "opened mobile navigation is keyboard traversable" \
  "document.activeElement?.textContent.trim()" \
  '"Home"'

mobile_route_checks=(
  "/|/work/|2"
  "/work/|/about/|3"
  "/about/|/writing/|4"
  "/writing/|/contact/|5"
  "/contact/|/|1"
)

for viewport in "320 800" "390 844"; do
  viewport_width=${viewport%% *}
  viewport_height=${viewport##* }

  for route_check in "${mobile_route_checks[@]}"; do
    IFS='|' read -r source_path target_path target_tabs <<< "$route_check"

    "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$source_path" >/dev/null
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" click "[data-mobile-navigation] summary" >/dev/null

    acceptance_browser_assert_eval \
      "the pointer-opened menu stays above $source_path content at ${viewport_width}px" \
      "(() => { const menu = document.querySelector('[data-mobile-navigation]'); return menu.open && Array.from(menu.querySelectorAll('a')).every(link => { const bounds = link.getBoundingClientRect(); const topmost = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2); return topmost === link || link.contains(topmost); }); })()" \
      "true"

    "$acceptance_playwright_cli" --session "$acceptance_browser_session" click "[data-mobile-navigation] a[href='$target_path']" >/dev/null
    acceptance_browser_assert_eval \
      "pointer activation reaches $target_path at ${viewport_width}px" \
      "window.location.pathname" \
      "\"$target_path\""

    "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$source_path" >/dev/null
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" press Enter >/dev/null

    for ((tab_index = 0; tab_index < target_tabs; tab_index++)); do
      "$acceptance_playwright_cli" --session "$acceptance_browser_session" press Tab >/dev/null
    done

    acceptance_browser_assert_eval \
      "keyboard traversal exposes visible focus for $target_path at ${viewport_width}px" \
      "(() => { const link = document.activeElement; const style = getComputedStyle(link); return link?.getAttribute('href') === '$target_path' && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; })()" \
      "true"

    "$acceptance_playwright_cli" --session "$acceptance_browser_session" press Enter >/dev/null
    acceptance_browser_assert_eval \
      "keyboard activation reaches $target_path at ${viewport_width}px" \
      "window.location.pathname" \
      "\"$target_path\""
  done
done

echo "PASS: English production site shell"
