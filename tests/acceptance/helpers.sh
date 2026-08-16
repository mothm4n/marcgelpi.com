#!/usr/bin/env bash

acceptance_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
acceptance_server_pid=""
acceptance_browser_tmp=""
acceptance_browser_site_dir=""
acceptance_browser_server_log=""
acceptance_browser_server_port=""
acceptance_browser_session=""
acceptance_playwright_cli=""
acceptance_page_quality_expression="(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()"
acceptance_writing_orientation_expression="(() => { const main = document.querySelector('main'); const introduction = main?.querySelector('.editorial-index-introduction'); const orientationLink = introduction?.querySelector('a'); const archiveLinks = Array.from(main?.querySelectorAll('ol a') ?? []); const dates = archiveLinks.map(link => link.querySelector('time')?.getAttribute('datetime')); const expectedIntroduction = 'I write about organizational effectiveness and ways of working; alignment, governance and decision-making; and evidence-based organizational change. Start with why changing a product decision does not prove the original choice was wrong.'; orientationLink?.focus(); const focusStyle = orientationLink && getComputedStyle(orientationLink); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && main?.querySelector('.editorial-index-deck')?.textContent.trim() === 'Notes on organizational effectiveness, decisions, and evidence-based change.' && introduction?.textContent.replace(/\\s+/g, ' ').trim() === expectedIntroduction && orientationLink?.textContent.trim() === 'why changing a product decision does not prove the original choice was wrong' && orientationLink?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && document.activeElement === orientationLink && focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0 && archiveLinks.length === 1 && archiveLinks[0]?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && archiveLinks[0]?.querySelector('strong')?.textContent.trim() === 'Life isn’t always a river' && dates.every((date, index) => index === 0 || date <= dates[index - 1]) && main?.querySelector('[data-tags], [data-categories], [data-filters], nav[aria-label=\"Topics\"]') === null && !main?.textContent.includes('Blog'); })()"
acceptance_writing_article_content_expression="(() => { const main = document.querySelector('main'); const body = main?.querySelector('.writing-body'); const headings = Array.from(body?.querySelectorAll('h2') ?? []).map(heading => heading.firstChild?.textContent.trim()); const source = body?.querySelector('a[href=\"https://www.oliverburkeman.com/meditationsformortals\"]'); return main?.querySelector('h1')?.textContent.trim() === 'Life isn’t always a river' && main?.querySelector('.writing-article-deck')?.textContent.trim() === 'Product decisions change. That doesn’t always mean they were wrong.' && main?.querySelector('time')?.getAttribute('datetime') === '2026-06-01' && body?.textContent.includes('We want meaning. We want coherence. We want the river to actually mean something.') && headings[0] === 'Why it matters' && headings.at(-1) === 'A useful principle' && source?.textContent.trim() === 'Meditations for Mortals' && main?.querySelector('details, aside, progress, [data-comments], [data-tags], [data-categories], [data-filters], nav[aria-label=\"On this page\"]') === null; })()"
acceptance_writing_article_metadata_expression="document.title === 'Life isn’t always a river · Marc Gelpí' && document.querySelector('meta[name=\"description\"]')?.content === 'A changed product decision is not automatically a bad one. See how visible reasoning helps teams distinguish learning from chaos.' && document.querySelector('.writing-article-deck')?.textContent.trim() === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('meta[property=\"og:description\"]')?.content === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('meta[name=\"twitter:description\"]')?.content === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('link[rel=canonical]')?.href === 'https://marcgelpi.com/writing/life-isnt-always-a-river/' && document.querySelector('meta[property=\"og:type\"]')?.content === 'article' && document.querySelector('.writing-article-meta')?.textContent.includes('4 min read')"
acceptance_resources_context_expression="(() => { const main = document.querySelector('main'); const introduction = main?.querySelector('.editorial-index-introduction'); const experienceLinks = Array.from(introduction?.querySelectorAll('a') ?? []); const expectedIntroduction = 'This guide is for leaders, OKR champions and people building internal support for change. It helps you explain why a bounded OKR pilot may be worth testing, prepare for objections and make a smaller ask. A full OKR introduction, company-wide rollout, compensation design and underlying strategy or ownership problems need separate work. For related experience, see the Adevinta case on scaling OKR practice and Marc’s wider experience with organizational change.'; const linksAreKeyboardAccessible = experienceLinks.every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }); return main?.querySelector('h1')?.textContent.trim() === 'Resources' && main?.querySelector('.editorial-index-deck')?.textContent.trim() === 'Practical material for leaders and teams working on organizational effectiveness.' && introduction?.textContent.replace(/\\s+/g, ' ').trim() === expectedIntroduction && experienceLinks.map(link => link.textContent.trim()).join('|') === 'the Adevinta case on scaling OKR practice|Marc’s wider experience with organizational change' && experienceLinks.map(link => link.getAttribute('href')).join('|') === '/work/adevinta/|/about/' && linksAreKeyboardAccessible; })()"

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

acceptance_browser_assert_writing_orientation() {
  local description=$1

  acceptance_browser_assert_eval "$description" "$acceptance_writing_orientation_expression" "true"
}

acceptance_browser_assert_writing_article() {
  local description=$1

  acceptance_browser_assert_eval "$description: content" "$acceptance_writing_article_content_expression" "true"
  acceptance_browser_assert_eval "$description: metadata" "$acceptance_writing_article_metadata_expression" "true"
}

acceptance_browser_assert_resources_context() {
  local description=$1

  acceptance_browser_assert_eval "$description" "$acceptance_resources_context_expression" "true"
}

acceptance_browser_assert_release_metadata() {
  local description=$1
  local public_paths_json=$2
  local article_paths_json=$3

  acceptance_browser_assert_eval \
    "$description" \
    "(async () => { const paths = $public_paths_json; const articlePaths = new Set($article_paths_json); const articlePath = '/writing/life-isnt-always-a-river/'; const articleSearchDescription = 'A changed product decision is not automatically a bad one. See how visible reasoning helps teams distinguish learning from chaos.'; const articleSocialDescription = 'Product decisions change. That doesn’t always mean they were wrong.'; const pageOverrides = new Map([['/', { socialTitle: 'Marc Gelpí', socialDescription: 'People-first organizational effectiveness and ways of working.' }], ['/about/', { type: 'profile' }], [articlePath, { searchDescription: articleSearchDescription, socialDescription: articleSocialDescription }]]); const pages = await Promise.all(paths.map(async path => { const response = await fetch(path); const html = await response.text(); const doc = new DOMParser().parseFromString(html, 'text/html'); const meta = key => Array.from(doc.querySelectorAll('meta')).find(node => node.getAttribute('name') === key || node.getAttribute('property') === key)?.content; return { path, ok: response.ok, lang: doc.documentElement.lang, title: doc.title, description: meta('description'), canonical: doc.querySelector('link[rel=\"canonical\"]')?.href, ogTitle: meta('og:title'), ogDescription: meta('og:description'), ogUrl: meta('og:url'), ogType: meta('og:type'), ogLocale: meta('og:locale'), ogImage: meta('og:image'), twitterCard: meta('twitter:card'), twitterDescription: meta('twitter:description') }; })); const uniqueTitles = new Set(pages.map(page => page.title)).size === pages.length; const uniqueDescriptions = new Set(pages.map(page => page.description)).size === pages.length; const accurate = pages.every(page => { const expectations = { type: articlePaths.has(page.path) ? 'article' : 'website', socialTitle: page.title, socialDescription: page.description, searchDescription: page.description, ...pageOverrides.get(page.path) }; return page.ok && page.lang === 'en' && page.title && page.description === expectations.searchDescription && page.canonical === 'https://marcgelpi.com' + page.path && page.ogTitle === expectations.socialTitle && page.ogDescription === expectations.socialDescription && page.twitterDescription === expectations.socialDescription && page.ogUrl === page.canonical && page.ogType === expectations.type && page.ogLocale === 'en_GB' && page.ogImage?.startsWith('https://marcgelpi.com/') && page.twitterCard === 'summary_large_image'; }); return uniqueTitles && uniqueDescriptions && accurate; })()" \
    "true"
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

acceptance_browser_assert_work_conversation_cta() {
  local description=$1

  acceptance_browser_assert_eval \
    "$description" \
    "(() => { const article = document.querySelector('.work-case'); const endings = Array.from(article?.querySelectorAll(':scope > [data-conversation-cta]') ?? []); const cta = endings[0]; const actions = Array.from(cta?.querySelectorAll('a') ?? []); const allCaseLinks = Array.from(article?.querySelectorAll('a') ?? []); return endings.length === 1 && cta === article?.lastElementChild && cta?.querySelector('.eyebrow')?.textContent.trim() === 'Recognize the pattern?' && cta?.querySelector('h2')?.textContent.trim() === 'Does any of this resonate?' && cta?.querySelector('[data-conversation-copy]')?.textContent.trim() === 'Have you seen a similar pattern in your own organization—or a different version of the same challenge? Let’s compare notes.' && actions.map(link => link.textContent.replace(/\\s+/g, ' ').trim()).join('|') === 'Start a conversation →|Back to all work ↖' && actions.map(link => link.getAttribute('href')).join('|') === '/contact/|/work/' && allCaseLinks.length === 2 && allCaseLinks.every((link, index) => link === actions[index]) && actions.every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }); })()" \
    "true"
}
