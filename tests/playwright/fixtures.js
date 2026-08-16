const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test: base, expect } = require('playwright/test');

const repoRoot = path.resolve(__dirname, '../..');

async function serveDirectory(directory) {
  const server = http.createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      let filePath = path.resolve(directory, `.${requestPath}`);
      if (!filePath.startsWith(`${directory}${path.sep}`) && filePath !== directory) {
        response.writeHead(403).end();
        return;
      }
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      response.writeHead(200);
      response.end(await fs.readFile(filePath));
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

const test = base.extend({
  createIsolatedArtifact: async ({}, use) => {
    const artifacts = [];
    await use(async ({ contentDirectory, environment = 'production' } = {}) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playwright-isolated-site.'));
      const directory = path.join(root, 'site');
      const args = [
        path.join(repoRoot, 'scripts/run-hugo.sh'),
        '--source',
        repoRoot,
        '--destination',
        directory,
        '--environment',
        environment,
        '--quiet',
      ];
      if (contentDirectory) {
        args.push('--contentDir', contentDirectory);
      }
      if (environment === 'development') {
        args.push('--buildDrafts');
      }
      const result = childProcess.spawnSync('bash', args, { env: process.env, encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || 'isolated Hugo build failed');
      }
      const served = await serveDirectory(directory);
      artifacts.push({ root, server: served.server });
      return { directory, url: served.url };
    });

    for (const artifact of artifacts) {
      await new Promise((resolve) => artifact.server.close(resolve));
      await fs.rm(artifact.root, { recursive: true, force: true });
    }
  },
});

module.exports = { test, expect };
