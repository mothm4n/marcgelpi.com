# Concise local test output

For a short summary of the complete test suite, run:

```sh
npm run --silent test:agent
```

This runs the existing `npm test` command and returns its exit status. The summary includes the result, elapsed time, and absolute paths to the complete combined stdout/stderr log and retained reports. When acceptance completes, it includes the existing acceptance duration and passed journey count. Failures list up to eight failed checks, using the existing sanitized Playwright failure summary or workflow `FAIL:` messages.

Each invocation gets a fresh temporary directory. Acceptance retains its existing timing, build, artifact, and failure reports there; it also keeps the sanitized failure summary at `test-results/failure-summary.tsv` for the existing evidence workflow. A failure before acceptance starts uses only the current log.

Keep complete logs and raw browser evidence local: they may contain review-only material. CI continues to publish evidence through `scripts/prepare-playwright-failure-evidence.sh`. Remove the reported temporary directory when diagnosis is complete.

To summarize a specific diagnostic command, pass its executable and arguments after `--`:

```sh
npm run --silent test:agent -- npm run test:workflow
```

The override runs only that command. Release verification requires the complete `npm test` suite; use the default agent command when checking a complete release artifact:

```sh
PLAYWRIGHT_PRODUCTION_ARTIFACT="$PWD/public" npm run --silent test:agent
```

To verify passing and failing summaries, preserved nonzero exit codes, complete local logs, and protection from stale failure reports:

```sh
bash tests/workflow/agent-test-summary.sh
```
