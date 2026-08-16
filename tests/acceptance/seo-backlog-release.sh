#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$acceptance_directory/helpers.sh"
source "$acceptance_directory/contracts/writing.sh"
source "$acceptance_directory/contracts/resources.sh"
source "$acceptance_directory/contracts/release-metadata.sh"
source "$acceptance_directory/contracts/work.sh"
source "$acceptance_repo_root/scripts/release-policy.sh"
acceptance_browser_setup "marcgelpi-seo-backlog" "${SITE_SEO_BACKLOG_TEST_PORT:-4198}" "marcgelpi-seo-backlog-$$"
trap acceptance_browser_cleanup EXIT

production_site="$acceptance_browser_tmp/production-site"
bash "$acceptance_repo_root/scripts/build-production.sh" "$production_site" >/dev/null
bash "$acceptance_repo_root/scripts/verify-production-release.sh" "$production_site" >/dev/null

[[ -f "$production_site/writing/index.html" ]] || acceptance_fail "approved Writing index is missing from the SEO release"
[[ -f "$production_site/writing/life-isnt-always-a-river/index.html" ]] || acceptance_fail "approved article is missing from the SEO release"
[[ -f "$production_site/resources/index.html" ]] || acceptance_fail "approved Resources index is missing from the SEO release"
[[ -f "$production_site/resources/how-to-sell-okrs/index.html" ]] || acceptance_fail "approved resource is missing from the SEO release"
[[ -f "$production_site/downloads/how-to-sell-okrs.pdf" ]] || acceptance_fail "approved resource download is missing from the SEO release"
[[ -f "$production_site/images/resources/okrs-focus-abstract.png" ]] || acceptance_fail "approved resource hero is missing from the SEO release"
[[ -f "$production_site/images/resources/okrs-four-outcomes.svg" ]] || acceptance_fail "approved resource diagram is missing from the SEO release"

public_paths_json=$(acceptance_paths_to_json "${release_public_paths[@]}")
article_paths_json=$(acceptance_paths_to_json \
  "/work/adevinta/" \
  "/work/protected-autonomy/" \
  "/work/preparing-to-scale/" \
  "/writing/life-isnt-always-a-river/" \
  "/resources/how-to-sell-okrs/")
unpublished_paths_json=$(acceptance_paths_to_json \
  "${release_hidden_paths[@]}" \
  "/writing/people-first-and-performance/" \
  "/resources/system-diagnosis/" \
  "/resources/review-resource/" \
  "/downloads/review-only.pdf" \
  "/images/resources/review-only.jpg")

acceptance_browser_start_and_open "$production_site" "/writing/"
acceptance_browser_assert_release_metadata \
  "the SEO release keeps canonical and social metadata valid across every public page" \
  "$public_paths_json" \
  "$article_paths_json"
acceptance_browser_assert_eval \
  "the SEO release excludes taxonomy, retired and review-only routes and assets" \
  "Promise.all($unpublished_paths_json.map(path => fetch(path))).then(responses => responses.every(response => response.status === 404))" \
  "true"
acceptance_browser_assert_writing_orientation "the SEO release preserves the approved Writing orientation and article path"
acceptance_browser_assert_headings_links_and_overflow_at_viewports "the Writing index"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/writing/life-isnt-always-a-river/" >/dev/null
acceptance_browser_assert_writing_article "the SEO release preserves the article while separating search and social copy"
acceptance_browser_assert_headings_links_and_overflow_at_viewports "the approved article"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/resources/" >/dev/null
acceptance_browser_assert_resources_context "the SEO release preserves the approved Resources context and experience links"

acceptance_browser_assert_eval \
  "the Resources index keeps its one approved guide and ordering" \
  "(() => { const links = Array.from(document.querySelectorAll('main ol a')); return links.length === 1 && links[0]?.getAttribute('href') === '/resources/how-to-sell-okrs/' && links[0]?.querySelector('strong')?.textContent.trim() === 'How to sell OKRs internally' && links[0]?.textContent.includes('Field guide · PDF'); })()" \
  "true"
acceptance_browser_assert_headings_links_and_overflow_at_viewports "the Resources index"

"$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port/resources/how-to-sell-okrs/" >/dev/null
acceptance_browser_assert_eval \
  "the approved resource retains its description, download and published images" \
  "(() => { const main = document.querySelector('main'); const images = Array.from(main?.querySelectorAll('img') ?? []).map(image => new URL(image.src).pathname).sort(); const downloads = Array.from(main?.querySelectorAll('a[download]') ?? []).map(link => link.getAttribute('href')); return main?.querySelector('h1')?.textContent.trim() === 'How to sell OKRs internally' && main?.querySelector('.resource-deck')?.textContent.trim() === 'A practical case for focus, alignment, accountability and ambitious learning — without selling OKRs as a cure-all.' && images.join('|') === '/images/resources/okrs-focus-abstract.png|/images/resources/okrs-four-outcomes.svg' && downloads.length === 2 && downloads.every(href => href === '/downloads/how-to-sell-okrs.pdf'); })()" \
  "true"

for case_path in /work/adevinta/ /work/protected-autonomy/ /work/preparing-to-scale/; do
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" open "http://127.0.0.1:$acceptance_browser_server_port$case_path" >/dev/null

  for viewport in "1440 1000" "390 844"; do
    viewport_width=${viewport%% *}
    viewport_height=${viewport##* }
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null
    acceptance_browser_assert_work_conversation_cta \
      "$case_path retains exactly one approved conversation ending at ${viewport_width}px"
    acceptance_browser_assert_eval \
      "$case_path keeps valid headings and width at ${viewport_width}px" \
      "$acceptance_page_heading_and_overflow_expression" \
      "true"
  done
done

echo "PASS: approved SEO backlog is one production-ready release"
