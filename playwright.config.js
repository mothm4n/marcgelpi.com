const os = require('node:os');
const path = require('node:path');
const { defineConfig } = require('playwright/test');

const port = Number(process.env.SITE_TEST_PORT || 4173);

if (!process.env.PLAYWRIGHT_ARTIFACT_REPORT) {
  process.env.PLAYWRIGHT_ARTIFACT_REPORT = path.join(
    os.tmpdir(),
    `playwright-artifacts-${process.pid}.tsv`,
  );
}

module.exports = defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  workers: 1,
  reporter: [['line'], ['./tests/playwright/timing-reporter.js']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'bash scripts/serve-playwright-site.sh',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
