#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
system_tmp=$(cd "${TMPDIR:-/tmp}" && pwd -P)
test_tmp=$(mktemp -d "$system_tmp/agent-test-summary-test.XXXXXX")
restore_failure_summary=0
failure_summary="$repo_root/test-results/failure-summary.tsv"
cleanup() {
  if [[ "$restore_failure_summary" -eq 1 ]]; then
    if [[ -f "$test_tmp/original-failure-summary.tsv" ]]; then
      cp "$test_tmp/original-failure-summary.tsv" "$failure_summary"
    else
      rm -f "$failure_summary"
    fi
  fi
  rm -rf "$test_tmp"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

contains() {
  grep --fixed-strings --quiet -- "$1" "$2" || fail "$2 does not contain: $1"
}

cat >"$test_tmp/passing-checks.sh" <<'CHECKS'
#!/usr/bin/env bash
set -euo pipefail
repo_root=$1
for ((line = 1; line <= 120; line++)); do
  echo "passing diagnostic $line"
done
echo 'passing stderr diagnostic' >&2
bash "$repo_root/scripts/publication-timing.sh" record "$ACCEPTANCE_REPORT_DIRECTORY/journeys.tsv" 'Total acceptance' 100 102
bash "$repo_root/scripts/publication-timing.sh" record "$ACCEPTANCE_REPORT_DIRECTORY/playwright-journeys.tsv" 'site-shell' 100 101
CHECKS

(
  cd "$repo_root"
  npm run --silent test:agent -- bash "$test_tmp/passing-checks.sh" "$repo_root"
) >"$test_tmp/passing-summary.log" 2>&1 || fail 'agent command rejected passing checks'

contains 'PASS: tests' "$test_tmp/passing-summary.log"
contains 'Acceptance: 2s; passed journeys: 1' "$test_tmp/passing-summary.log"
full_log=$(sed -n 's/^Full log: //p' "$test_tmp/passing-summary.log")
[[ "$full_log" == "$system_tmp"/agent-test.*/test.log && -f "$full_log" ]] || fail 'passing summary does not locate its complete local log'
contains 'passing diagnostic 1' "$full_log"
contains 'passing diagnostic 120' "$full_log"
contains 'passing stderr diagnostic' "$full_log"
[[ $(wc -l <"$test_tmp/passing-summary.log") -le 8 ]] || fail 'passing summary is not concise'
if grep --fixed-strings --quiet 'passing diagnostic' "$test_tmp/passing-summary.log"; then
  fail 'passing command printed its full diagnostic output'
fi
rm -rf "$(dirname "$full_log")"

cat >"$test_tmp/failing-checks.sh" <<'CHECKS'
#!/usr/bin/env bash
set -euo pipefail
echo 'review-only diagnostic content'
echo 'failure stderr diagnostic' >&2
echo 'not ok 1 - diagnostic that must not replace the sanitized report'
printf 'journey\tfile\tline\tstatus\tduration_ms\tretry\nwriting\tpublic-journeys.spec.js\t42\tfailed\t1300\t0\nsite-shell\tsite-shell.spec.js\t17\ttimedOut\t30000\t1\n' \
  >"$ACCEPTANCE_REPORT_DIRECTORY/failure-summary.tsv"
exit 23
CHECKS

failing_status=0
(
  cd "$repo_root"
  npm run --silent test:agent -- bash "$test_tmp/failing-checks.sh"
) >"$test_tmp/failing-summary.log" 2>&1 || failing_status=$?
[[ "$failing_status" -eq 23 ]] || fail "agent command changed the failing exit status to $failing_status"
contains 'FAIL: tests (exit 23;' "$test_tmp/failing-summary.log"
contains 'writing: failed (public-journeys.spec.js:42; retry 0)' "$test_tmp/failing-summary.log"
contains 'site-shell: timedOut (site-shell.spec.js:17; retry 1)' "$test_tmp/failing-summary.log"
full_log=$(sed -n 's/^Full log: //p' "$test_tmp/failing-summary.log")
[[ "$full_log" == "$system_tmp"/agent-test.*/test.log && -f "$full_log" ]] || fail 'failing summary does not locate its complete local log'
contains 'review-only diagnostic content' "$full_log"
contains 'failure stderr diagnostic' "$full_log"
[[ $(wc -l <"$test_tmp/failing-summary.log") -le 10 ]] || fail 'failing summary is not concise'
if grep --fixed-strings --quiet 'review-only diagnostic content' "$test_tmp/failing-summary.log"; then
  fail 'agent summary printed review-only diagnostic content'
fi
if grep --fixed-strings --quiet 'must not replace the sanitized report' "$test_tmp/failing-summary.log"; then
  fail 'agent summary replaced its sanitized report with TAP diagnostics'
fi
contains 'writing' "$(dirname "$full_log")/acceptance/failure-summary.tsv"
rm -rf "$(dirname "$full_log")"

cat >"$test_tmp/failing-tap-checks.js" <<'CHECKS'
const { test } = require('node:test');
for (let check = 1; check <= 10; check++) {
  const title = `publication check ${check}` + (check === 1 ? ' long title'.repeat(50) : '');
  test(title, () => { throw new Error('review-only TAP diagnostic content'); });
}
CHECKS

tap_status=0
(
  cd "$repo_root"
  # Release-command regressions run npm test from a Node test worker. Start this
  # independent TAP command without the outer worker's internal runner context.
  npm run --silent test:agent -- env -u NODE_TEST_CONTEXT node --test --test-reporter=tap "$test_tmp/failing-tap-checks.js"
) >"$test_tmp/tap-summary.log" 2>&1 || tap_status=$?
[[ "$tap_status" -eq 1 ]] || fail "agent command changed the TAP failure exit status to $tap_status"
contains 'FAIL: tests (exit 1;' "$test_tmp/tap-summary.log"
contains 'not ok 1 - publication check 1' "$test_tmp/tap-summary.log"
contains 'not ok 8 - publication check 8' "$test_tmp/tap-summary.log"
contains '2 further failed checks; see the full log' "$test_tmp/tap-summary.log"
[[ $(wc -l <"$test_tmp/tap-summary.log") -le 12 ]] || fail 'TAP failure summary is not concise'
awk '/^  - / && length($0) > 244 { exit 1 }' "$test_tmp/tap-summary.log" || fail 'TAP summary contains an unbounded check title'
if grep --extended-regexp --quiet 'review-only TAP diagnostic content|not ok 9 -|before a check report' "$test_tmp/tap-summary.log"; then
  fail 'TAP summary omitted check titles or printed diagnostic output'
fi
full_log=$(sed -n 's/^Full log: //p' "$test_tmp/tap-summary.log")
[[ "$full_log" == "$system_tmp"/agent-test.*/test.log && -f "$full_log" ]] || fail 'TAP summary does not locate its complete local log'
contains 'review-only TAP diagnostic content' "$full_log"
contains 'not ok 10 - publication check 10' "$full_log"
rm -rf "$(dirname "$full_log")"

mkdir -p "$(dirname "$failure_summary")"
if [[ -f "$failure_summary" ]]; then
  cp "$failure_summary" "$test_tmp/original-failure-summary.tsv"
fi
restore_failure_summary=1
printf 'journey\tfile\tline\tstatus\tduration_ms\tretry\nstale-check\told.spec.js\t9\tfailed\t1000\t0\n' >"$failure_summary"
cat >"$test_tmp/early-failing-checks.sh" <<'CHECKS'
#!/usr/bin/env bash
echo 'early failure diagnostic' >&2
echo 'FAIL: publication approval check' >&2
exit 19
CHECKS

early_status=0
(
  cd "$repo_root"
  npm run --silent test:agent -- bash "$test_tmp/early-failing-checks.sh"
) >"$test_tmp/early-summary.log" 2>&1 || early_status=$?
[[ "$early_status" -eq 19 ]] || fail "agent command changed an early failure exit status to $early_status"
contains 'FAIL: publication approval check' "$test_tmp/early-summary.log"
if grep --fixed-strings --quiet 'stale-check' "$test_tmp/early-summary.log"; then
  fail 'agent summary reused an earlier failure report'
fi
full_log=$(sed -n 's/^Full log: //p' "$test_tmp/early-summary.log")
[[ "$full_log" == "$system_tmp"/agent-test.*/test.log && -f "$full_log" ]] || fail 'early failure summary does not locate its complete local log'
contains 'early failure diagnostic' "$full_log"
rm -rf "$(dirname "$full_log")"

echo 'PASS: concise agent test summaries'
