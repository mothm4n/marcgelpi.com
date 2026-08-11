#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-responsive" "${SITE_RESPONSIVE_TEST_PORT:-4191}" "marcgelpi-responsive-$$"
trap acceptance_browser_cleanup EXIT

acceptance_browser_build_preview "$acceptance_browser_site_dir"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/"

public_paths=(
  "/"
  "/work/"
  "/work/adevinta/"
  "/work/protected-autonomy/"
  "/work/preparing-to-scale/"
  "/about/"
  "/contact/"
)

for public_path in "${public_paths[@]}"; do
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$public_path" >/dev/null

  for viewport in "320 800" "390 844" "1440 1000"; do
    viewport_width=${viewport%% *}
    viewport_height=${viewport##* }
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null

    acceptance_browser_assert_eval \
      "$public_path reflows without page-level horizontal scrolling at ${viewport_width}px" \
      "document.documentElement.scrollWidth <= document.documentElement.clientWidth" \
      "true"
  done

  "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 320 800 >/dev/null
  acceptance_browser_assert_eval \
    "$public_path remains usable with WCAG text-spacing overrides" \
    "(() => { const overrides = document.createElement('style'); overrides.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'; document.head.append(overrides); const menu = document.querySelector('[data-mobile-navigation]'); if (menu) menu.open = true; const textIsClipped = Array.from(document.querySelectorAll('body *')).some(element => { const hasDirectText = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()); if (!hasDirectText) return false; const style = getComputedStyle(element); const clipsHorizontally = ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1; const clipsVertically = ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1; return clipsHorizontally || clipsVertically; }); const controls = Array.from(document.querySelectorAll('a, button, summary')).filter(control => { const bounds = control.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; }); const controlsRemainOperable = controls.every(control => { control.focus(); const bounds = control.getBoundingClientRect(); return document.activeElement === control && !control.matches(':disabled') && bounds.left >= -1 && bounds.right <= innerWidth + 1; }); return document.documentElement.scrollWidth <= document.documentElement.clientWidth && !textIsClipped && controlsRemainOperable; })()" \
    "true"
done

echo "PASS: public V0 responsive quality"
