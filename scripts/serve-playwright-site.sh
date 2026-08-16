#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
server_root=$(mktemp -d "${TMPDIR:-/tmp}/playwright-site.XXXXXX")
production_directory="$server_root/production"
preview_directory="$server_root/preview"
server_port=${SITE_TEST_PORT:-4173}
preview_port=${SITE_PREVIEW_TEST_PORT:-4174}
production_server_pid=""
preview_server_pid=""

cleanup() {
  for server_pid in "$production_server_pid" "$preview_server_pid"; do
    if [[ -n "$server_pid" ]]; then
      kill "$server_pid" >/dev/null 2>&1 || true
      wait "$server_pid" 2>/dev/null || true
    fi
  done
  rm -rf "$server_root"
}

trap cleanup EXIT
trap 'exit 0' INT TERM

if [[ -n "${PLAYWRIGHT_PRODUCTION_ARTIFACT:-}" ]]; then
  [[ -d "$PLAYWRIGHT_PRODUCTION_ARTIFACT" ]] || {
    echo "Canonical production artifact does not exist: $PLAYWRIGHT_PRODUCTION_ARTIFACT" >&2
    exit 2
  }
  production_directory=$(cd "$PLAYWRIGHT_PRODUCTION_ARTIFACT" && pwd -P)
  canonical_production_directory="$repo_root/public"
  [[ "$production_directory" == "$canonical_production_directory" ]] || {
    echo "Refusing non-canonical production artifact: $production_directory" >&2
    exit 2
  }
else
  bash "$repo_root/scripts/build-production.sh" "$production_directory" >/dev/null
fi

bash "$repo_root/scripts/run-hugo.sh" \
  --source "$repo_root" \
  --destination "$preview_directory" \
  --environment development \
  --buildDrafts \
  --quiet

if [[ -n "${PLAYWRIGHT_BUILD_REPORT:-}" ]]; then
  printf 'production\t1\npreview\t1\n' >"$PLAYWRIGHT_BUILD_REPORT"
fi

if [[ -n "${PLAYWRIGHT_ARTIFACT_REPORT:-}" ]]; then
  printf 'production\t%s\npreview\t%s\n' \
    "$production_directory" \
    "$preview_directory" \
    >"$PLAYWRIGHT_ARTIFACT_REPORT"
fi

python3 -m http.server "$server_port" \
  --bind 127.0.0.1 \
  --directory "$production_directory" &
production_server_pid=$!

python3 -m http.server "$preview_port" \
  --bind 127.0.0.1 \
  --directory "$preview_directory" &
preview_server_pid=$!

wait "$production_server_pid"
