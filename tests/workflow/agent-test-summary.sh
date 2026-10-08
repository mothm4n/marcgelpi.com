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
contains 'writing' "$(dirname "$full_log")/acceptance/failure-summary.tsv"
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
