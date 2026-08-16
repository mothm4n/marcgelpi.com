const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test: base, expect } = require('playwright/test');

const repoRoot = path.resolve(__dirname, '../..');

function journeyName(title) {
  return title === 'English production site shell'
    ? 'site-shell'
    : title.replace(/ journey$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function run(command, args, env = process.env) {
  return childProcess.spawnSync(command, args, { env, encoding: 'utf8' });
}

async function recordFixtureBuild(testInfo) {
  if (process.env.PLAYWRIGHT_FIXTURE_BUILD_REPORT) {
    await fs.appendFile(
      process.env.PLAYWRIGHT_FIXTURE_BUILD_REPORT,
      `${journeyName(testInfo.title)}\t1\n`,
    );
  }
}

async function readArtifactReport() {
  const report = await fs.readFile(process.env.PLAYWRIGHT_ARTIFACT_REPORT, 'utf8');
  return Object.fromEntries(
    report.trim().split('\n').map((line) => line.split('\t')),
  );
}

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
  canonicalArtifacts: async ({}, use) => {
    const directories = await readArtifactReport();
    await use({
      productionDirectory: directories.production,
      previewDirectory: directories.preview,
    });
  },

  createContentFixture: async ({}, use) => {
    const roots = [];
    await use(async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playwright-content.'));
      const directory = path.join(root, 'content');
      await fs.cp(path.join(repoRoot, 'content'), directory, { recursive: true });
      roots.push(root);
      return {
        directory,
        copyFixture: async (source, destination) => {
          const destinationPath = path.join(directory, destination);
          await fs.mkdir(path.dirname(destinationPath), { recursive: true });
          await fs.copyFile(path.join(repoRoot, 'tests/fixtures', source), destinationPath);
        },
        append: (destination, content) => fs.appendFile(path.join(directory, destination), content),
      };
    });

    for (const root of roots) {
      await fs.rm(root, { recursive: true, force: true });
    }
  },

  createIsolatedArtifact: async ({}, use, testInfo) => {
    const artifacts = [];
    await use(async ({ contentDirectory, environment = 'production' } = {}) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playwright-isolated-site.'));
      const directory = path.join(root, 'site');
      let args;
      let env = process.env;
      if (environment === 'production') {
        args = [path.join(repoRoot, 'scripts/build-production.sh'), directory];
        env = { ...process.env, ...(contentDirectory ? { SITE_CONTENT_DIR: contentDirectory } : {}) };
      } else {
        args = [
          path.join(repoRoot, 'scripts/run-hugo.sh'),
          '--source',
          repoRoot,
          '--destination',
          directory,
          '--environment',
          environment,
          '--buildDrafts',
          '--quiet',
        ];
        if (contentDirectory) {
          args.push('--contentDir', contentDirectory);
        }
      }
      await recordFixtureBuild(testInfo);
      const result = run('bash', args, env);
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

  expectProductionRejection: async ({}, use, testInfo) => {
    const roots = [];
    await use(async ({ contentDirectory, expectedError, seedFiles = {} }) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playwright-rejected-site.'));
      const directory = path.join(root, 'site');
      await fs.mkdir(directory, { recursive: true });
      for (const [relativePath, content] of Object.entries(seedFiles)) {
        const destination = path.join(directory, relativePath);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, content);
      }
      roots.push(root);
      await recordFixtureBuild(testInfo);
      const result = run(
        'bash',
        [path.join(repoRoot, 'scripts/build-production.sh'), directory],
        { ...process.env, SITE_CONTENT_DIR: contentDirectory },
      );
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status, output).not.toBe(0);
      expect(output).toContain(expectedError);
      return { directory, output };
    });

    for (const root of roots) {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
});

module.exports = { test, expect };
