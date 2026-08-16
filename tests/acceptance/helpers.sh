#!/usr/bin/env bash

acceptance_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
acceptance_server_pid=""
acceptance_browser_tmp=""
acceptance_browser_site_dir=""
acceptance_browser_server_log=""
acceptance_browser_server_port=""
acceptance_browser_session=""
acceptance_playwright_cli=""
acceptance_page_heading_and_overflow_expression="(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()"
acceptance_page_keyboard_links_expression="(() => Array.from(document.querySelectorAll('main a')).filter(link => link.getClientRects().length > 0).every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }))()"

acceptance_fail() {
  echo "FAIL: $1" >&2
  exit 1
}

acceptance_contains() {
  local pattern=$1
  local path=$2

  if command -v rg >/dev/null 2>&1; then
    rg --quiet "$pattern" "$path"
  elif [[ -d "$path" ]]; then
    grep -ERq "$pattern" "$path"
  else
    grep -Eq "$pattern" "$path"
  fi
}

acceptance_paths_to_json() {
  local serialized
  serialized=$(printf '"%s",' "$@")
  printf '[%s]\n' "${serialized%,}"
}

acceptance_publication_record_is_approved() {
  local data_file=$1
  local record=$2

  awk -v record="$record" '
    function scalar_value(line) {
      sub(/^[^:]+:[[:space:]]*/, "", line)
      gsub(/^"|"$/, "", line)
      return line
    }

    $0 == record ":" {
      in_record = 1
      next
    }

    in_record && /^[^[:space:]]/ {
      in_record = 0
      in_publication = 0
    }

    in_record && /^  publication:/ {
      in_publication = 1
      next
    }

    in_publication && $1 == "status:" {
      status = scalar_value($0)
    }

    in_publication && $1 == "reviewed_by:" {
      reviewed_by = scalar_value($0)
    }

    in_publication && $1 == "reviewed_at:" {
      reviewed_at = scalar_value($0)
    }

    in_publication && $1 == "privacy_reviewed:" {
      privacy_reviewed = scalar_value($0)
    }

    END {
      exit !(status == "approved" && reviewed_by != "" && reviewed_at != "" && privacy_reviewed == "true")
    }
  ' "$data_file"
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

acceptance_browser_assert_headings_links_and_overflow_at_viewports() {
  local subject=$1

  for viewport in "1440 1000" "390 844"; do
    local viewport_width=${viewport%% *}
    local viewport_height=${viewport##* }
    "$acceptance_playwright_cli" --session "$acceptance_browser_session" resize "$viewport_width" "$viewport_height" >/dev/null
    acceptance_browser_assert_eval \
      "$subject keeps valid headings and width at ${viewport_width}px" \
      "$acceptance_page_heading_and_overflow_expression" \
      "true"
    acceptance_browser_assert_eval \
      "$subject keeps keyboard-visible links at ${viewport_width}px" \
      "$acceptance_page_keyboard_links_expression" \
      "true"
  done
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

  bash "$acceptance_repo_root/scripts/run-hugo.sh" "${hugo_args[@]}"
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
