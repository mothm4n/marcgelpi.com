#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$repo_root/scripts/release-policy.sh"
requested_site=${1:-public}

if [[ "$requested_site" = /* ]]; then
  site_directory=$requested_site
else
  site_directory="$repo_root/$requested_site"
fi

fail() {
  echo "Release artifact is not deployable: $1" >&2
  exit 1
}

required_files=(
  CNAME
  index.xml
  robots.txt
  sitemap.xml
)

for public_path in "${release_public_paths[@]}"; do
  required_files+=("$(release_path_to_artifact "$public_path")")
done

for relative_path in "${required_files[@]}"; do
  [[ -f "$site_directory/$relative_path" ]] || fail "missing $relative_path"
done

for hidden_path in "${release_hidden_paths[@]}"; do
  hidden_html=$(release_path_to_artifact "$hidden_path")
  hidden_feed="${hidden_html%index.html}index.xml"
  [[ ! -e "$site_directory/$hidden_html" ]] || fail "hidden route is present: $hidden_path"
  [[ ! -e "$site_directory/$hidden_feed" ]] || fail "hidden route feed is present: $hidden_path"
done

[[ "$(tr -d '[:space:]' < "$site_directory/CNAME")" = "marcgelpi.com" ]] || fail "CNAME is not marcgelpi.com"
grep --fixed-strings --quiet 'data-home-section=selected-work' "$site_directory/index.html" || fail "editorial homepage is not active"

if grep --recursive --ignore-case --extended-regexp --quiet \
  "$release_forbidden_artifact_pattern" \
  "$site_directory"; then
  fail "review-only or disallowed visitor behavior is present"
fi

echo "PASS: deployable production artifact"
