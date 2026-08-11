#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-responsive" "${SITE_RESPONSIVE_TEST_PORT:-4191}" "marcgelpi-responsive-$$"
trap acceptance_browser_cleanup EXIT

bash "$acceptance_repo_root/scripts/build-production.sh" "$acceptance_browser_site_dir" >/dev/null
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
    "(() => { const overrides = document.createElement('style'); overrides.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'; document.head.append(overrides); return document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()" \
    "true"
done

echo "PASS: public V0 responsive quality"
