#!/usr/bin/env bash

acceptance_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
acceptance_server_pid=""
acceptance_browser_tmp=""
acceptance_browser_site_dir=""
acceptance_browser_server_log=""
acceptance_browser_server_port=""
acceptance_browser_session=""
acceptance_playwright_cli=""

acceptance_fail() {
  echo "FAIL: $1" >&2
  exit 1
}

acceptance_assert_eval() {
  local playwright_cli=$1
  local session=$2
  local description=$3
  local expression=$4
  local expected=$5
  local output
  local matched=false

  output=$("$playwright_cli" --session "$session" eval "$expression")
  while IFS= read -r line; do
    if [[ "$line" == "$expected" ]]; then
      matched=true
      break
    fi
  done <<< "$output"

  if [[ "$matched" != true ]]; then
    echo "$output" >&2
    acceptance_fail "$description (expected $expected)"
  fi
}

acceptance_start_server() {
  local directory=$1
  local port=$2
  local server_log=$3

  python3 -m http.server "$port" \
    --bind 127.0.0.1 \
    --directory "$directory" \
    >"$server_log" 2>&1 &
  acceptance_server_pid=$!

  for _ in {1..40}; do
    if curl --fail --silent "http://127.0.0.1:$port/" >/dev/null; then
      return
    fi
    sleep 0.25
  done

  cat "$server_log" >&2
  acceptance_fail "generated site did not start"
}

acceptance_stop_server() {
  if [[ -n "$acceptance_server_pid" ]]; then
    kill "$acceptance_server_pid" >/dev/null 2>&1 || true
    wait "$acceptance_server_pid" 2>/dev/null || true
    acceptance_server_pid=""
  fi
}

acceptance_browser_setup() {
  local temporary_prefix=$1
  local port=$2
  local session=$3

  acceptance_browser_tmp=$(mktemp -d "${TMPDIR:-/tmp}/${temporary_prefix}.XXXXXX")
  acceptance_browser_site_dir="$acceptance_browser_tmp/site"
  acceptance_browser_server_log="$acceptance_browser_tmp/server.log"
  acceptance_browser_server_port=$port
  acceptance_browser_session=$session
  acceptance_playwright_cli="$acceptance_repo_root/node_modules/.bin/playwright-cli"

  [[ -x "$acceptance_playwright_cli" ]] || acceptance_fail "Playwright CLI is not installed; run npm ci"
}

acceptance_browser_cleanup() {
  "$acceptance_playwright_cli" --session "$acceptance_browser_session" close >/dev/null 2>&1 || true
  acceptance_stop_server
  rm -rf "$acceptance_browser_tmp"
}

acceptance_browser_assert_eval() {
  acceptance_assert_eval "$acceptance_playwright_cli" "$acceptance_browser_session" "$@"
}

acceptance_browser_build_preview() {
  local destination=$1
  local content_directory=${2:-}
  local -a hugo_args=(
    --source "$acceptance_repo_root"
    --destination "$destination"
    --environment development
    --buildDrafts
    --quiet
  )

  if [[ -n "$content_directory" ]]; then
    hugo_args+=(--contentDir "$content_directory")
  fi

  hugo "${hugo_args[@]}"
}

acceptance_browser_start_and_open() {
  local directory=$1
  local path=$2

  acceptance_start_server "$directory" "$acceptance_browser_server_port" "$acceptance_browser_server_log"
  "$acceptance_playwright_cli" \
    --session "$acceptance_browser_session" \
    open "http://127.0.0.1:$acceptance_browser_server_port$path" \
    >/dev/null
}
