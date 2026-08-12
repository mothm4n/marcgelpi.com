#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
acceptance_browser_setup "marcgelpi-density" "${SITE_DENSITY_TEST_PORT:-4193}" "marcgelpi-density-$$"
trap acceptance_browser_cleanup EXIT

acceptance_browser_build_preview "$acceptance_browser_site_dir"
acceptance_browser_start_and_open "$acceptance_browser_site_dir" "/"

density_targets=(
  "Home|/|5220"
  "Work|/work/|1704"
  "About|/about/|6203"
  "Adevinta case|/work/adevinta/|4447"
  "Contact|/contact/|2166"
)

for density_target in "${density_targets[@]}"; do
  route_label=${density_target%%|*}
  target_remainder=${density_target#*|}
  route_path=${target_remainder%%|*}
  maximum_height=${target_remainder##*|}
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$route_path" >/dev/null
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 390 844 >/dev/null

  acceptance_browser_assert_eval \
    "$route_label meets its agreed mobile density target" \
    "document.documentElement.scrollHeight <= $maximum_height" \
    "true"
done

readable_routes=(
  "/|.home-item-description, .home-method li p"
  "/about/|.about-story p:not(:first-child), .about-strengths p, .about-career article > p:last-child"
  "/work/adevinta/|.case-stage-copy p:not(.case-scope)"
  "/contact/|.contact-introduction p, .contact-topics li span:last-child"
)

for readable_route in "${readable_routes[@]}"; do
  route_path=${readable_route%%|*}
  body_selectors=${readable_route#*|}
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$route_path" >/dev/null
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize 1440 1000 >/dev/null

  acceptance_browser_assert_eval \
    "$route_path keeps primary body copy within readable line measures" \
    "(() => { const sample = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); return Array.from(document.querySelectorAll('$body_selectors')).every(element => { const style = getComputedStyle(element); context.font = style.font; const averageCharacterWidth = context.measureText(sample).width / sample.length; const charactersPerLine = element.getBoundingClientRect().width / averageCharacterWidth; const lineHeightRatio = parseFloat(style.lineHeight) / parseFloat(style.fontSize); return charactersPerLine <= 80 && lineHeightRatio >= 1.5 && lineHeightRatio <= 2; }); })()" \
    "true"
done

echo "PASS: measured V1 information density"
