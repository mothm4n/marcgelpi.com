#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
config="$repo_root/playwright.config.js"
runner="$repo_root/tests/acceptance/run.sh"
spec="$repo_root/tests/playwright/site-shell.spec.js"
server="$repo_root/scripts/serve-playwright-site.sh"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  local text=$1
  local path=$2
  grep --fixed-strings --quiet -- "$text" "$path" || fail "$path does not contain: $text"
}

[[ -f "$config" ]] || fail "Playwright Test config is missing"
[[ -f "$spec" ]] || fail "site-shell Playwright Test journey is missing"
[[ -f "$server" ]] || fail "managed Playwright site server is missing"
[[ ! -e "$repo_root/tests/acceptance/site-shell.sh" ]] || fail "legacy site-shell journey still exists"

contains "workers: 1" "$config"
contains "webServer:" "$config"
contains "bash scripts/serve-playwright-site.sh" "$config"
contains "test('English production site shell'" "$spec"
contains "npx playwright test" "$runner"
contains 'site_shell_duration > 86' "$runner"
contains 'scripts/run-hugo.sh' "$server"

echo "PASS: Playwright Test site-shell tracer bullet contract"
