const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const repository = path.resolve(__dirname, '../..');
const command = path.join(repository, 'scripts/prepare-release.js');
let nextPort = 4870;
const regressionLog = path.join(os.tmpdir(), `release-preparation-tests-${process.pid}.log`);
console.log(`Full command logs: ${regressionLog}`);

function run(program, args, cwd, options = {}) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${program} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function git(cwd, ...args) { return run('git', args, cwd); }

function fixture(t, trailingBlankLines = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preparation-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  const archive = spawnSync('git', ['archive', 'HEAD'], { cwd: repository, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(archive.status, 0);
  run('tar', ['-xf', '-', '-C', source], repository, { input: archive.stdout });
  fs.rmSync(path.join(source, '.gitmodules'), { force: true });
  const common = git(repository, 'rev-parse', '--git-common-dir');
  const themeGit = path.resolve(repository, common, 'modules/themes/blowfish');
  const themeRevision = git(repository, 'rev-parse', 'HEAD:themes/blowfish');
  const themeArchive = path.join(root, 'theme.tar');
  run('git', [`--git-dir=${themeGit}`, 'archive', '--output', themeArchive, themeRevision], repository);
  const themeDirectory = path.join(source, 'themes/blowfish');
  fs.mkdirSync(themeDirectory, { recursive: true });
  run('tar', ['-xf', themeArchive, '-C', themeDirectory], repository);
  fs.rmSync(themeArchive);
  fs.writeFileSync(path.join(source, 'static/selected.txt'), 'base first\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\nbase last\n' + (trailingBlankLines ? '\n\n' : ''));
  fs.writeFileSync(path.join(source, 'static/unrelated.txt'), 'base unrelated\n');
  fs.writeFileSync(path.join(source, 'static/retire.txt'), 'retire this\n');
  git(source, 'init', '-b', 'master');
  git(source, 'config', 'user.email', 'release-test@example.invalid');
  git(source, 'config', 'user.name', 'Release Test');
  git(source, 'add', '.');
  git(source, 'commit', '-qm', 'Published baseline');
  const baseline = git(source, 'rev-parse', 'HEAD');
  git(source, 'update-ref', 'refs/remotes/origin/master', baseline);
  return { root, source, baseline, output: path.join(root, 'candidate') };
}

function prepare(f, paths, extraEnv = {}) {
  const result = spawnSync(process.execPath, [command, '--output', f.output, '--', ...paths], {
    cwd: f.source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SITE_TEST_PORT: String(nextPort++), SITE_PREVIEW_TEST_PORT: String(nextPort++), ...extraEnv },
  });
  fs.appendFileSync(regressionLog, `\nPREPARE ${paths.join(' ')} exit=${result.status}\n${result.stdout}\n${result.stderr}\n`);
  const receiptPath = path.join(f.output, 'candidate.json');
  if (fs.existsSync(receiptPath)) {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    for (const [name, logPath] of Object.entries(receipt.logs)) {
      if (fs.existsSync(logPath)) fs.appendFileSync(regressionLog, `\n${name}\n${fs.readFileSync(logPath, 'utf8')}`);
    }
  }
  assert.ok(result.stdout.trim(), `Preparation returned no result (${result.status}): ${result.stderr}`);
  return { ...result, result: JSON.parse(result.stdout) };
}

function snapshot(source) {
  return {
    head: git(source, 'rev-parse', 'HEAD'),
    status: git(source, 'status', '--porcelain=v1'),
    unstaged: git(source, 'diff', '--binary'),
    staged: git(source, 'diff', '--cached', '--binary'),
    selected: fs.readFileSync(path.join(source, 'static/selected.txt'), 'utf8'),
    privateFile: fs.existsSync(path.join(source, 'private.txt')) ? fs.readFileSync(path.join(source, 'private.txt'), 'utf8') : null,
    publicEntries: fs.existsSync(path.join(source, 'public')) ? fs.readdirSync(path.join(source, 'public')).sort() : [],
    originalArtifact: fs.existsSync(path.join(source, 'public/existing.txt')) ? fs.readFileSync(path.join(source, 'public/existing.txt'), 'utf8') : null,
  };
}

test('preparation verifies only selected local changes and preserves other work', (t) => {
  const f = fixture(t, true);
  const selected = path.join(f.source, 'static/selected.txt');
  fs.writeFileSync(selected, fs.readFileSync(selected, 'utf8').replace('base first', 'local committed first'));
  fs.writeFileSync(path.join(f.source, 'static/unpublished.txt'), 'local committed file\n');
  git(f.source, 'add', 'static/selected.txt', 'static/unpublished.txt');
  git(f.source, 'commit', '-qm', 'Unpublished work');
  fs.writeFileSync(selected, fs.readFileSync(selected, 'utf8').replace('base last', 'selected last'));
  fs.writeFileSync(path.join(f.source, 'static/unrelated.txt'), 'unrelated staged edit\n');
  git(f.source, 'add', 'static/unrelated.txt');
  fs.writeFileSync(path.join(f.source, 'private.txt'), 'private untracked note\n');
  fs.writeFileSync(path.join(f.source, 'static/new-release.txt'), 'selected new file\n');
  fs.unlinkSync(path.join(f.source, 'static/retire.txt'));
  fs.mkdirSync(path.join(f.source, 'public'));
  fs.writeFileSync(path.join(f.source, 'public/existing.txt'), 'existing local artifact\n');
  const before = snapshot(f.source);
  const prepared = prepare(f, ['static/selected.txt', 'static/new-release.txt', 'static/retire.txt'], {
    GIT_INDEX_FILE: path.join(f.source, '.git/index'),
    HUGO_BUILD_COUNT_FILE: path.join(f.source, 'private.txt'),
    HUGO_CACHE_DIR: path.join(f.source, 'public'),
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(prepared.result.status, 'ready');
  const receipt = JSON.parse(fs.readFileSync(prepared.result.receipt, 'utf8'));
  assert.equal(receipt.publication.baseRevision, f.baseline);
  assert.equal(git(receipt.checkout, 'rev-parse', 'HEAD^'), f.baseline);
  assert.equal(git(receipt.checkout, 'rev-parse', 'HEAD'), receipt.revision);
  assert.equal(fs.readFileSync(path.join(receipt.artifact.directory, 'selected.txt'), 'utf8'), 'base first\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\nselected last\n\n\n');
  assert.equal(fs.readFileSync(path.join(receipt.artifact.directory, 'new-release.txt'), 'utf8'), 'selected new file\n');
  assert.equal(fs.readFileSync(path.join(receipt.artifact.directory, 'unrelated.txt'), 'utf8'), 'base unrelated\n');
  for (const excluded of ['unpublished.txt', 'private.txt', 'retire.txt']) {
    assert.equal(fs.existsSync(path.join(receipt.artifact.directory, excluded)), false, excluded);
  }
  assert.deepEqual(Object.values(receipt.checks), ['passed', 'passed', 'passed', 'passed', 'passed']);
  assert.deepEqual(snapshot(f.source), before);
});

test('a selection that depends on unpublished history fails without disturbing source work', (t) => {
  const f = fixture(t);
  const selected = path.join(f.source, 'static/selected.txt');
  fs.writeFileSync(selected, fs.readFileSync(selected, 'utf8').replace('base last', 'unpublished last'));
  git(f.source, 'add', 'static/selected.txt');
  git(f.source, 'commit', '-qm', 'Unpublished conflicting work');
  fs.writeFileSync(selected, fs.readFileSync(selected, 'utf8').replace('unpublished last', 'selected last'));
  const before = snapshot(f.source);
  const prepared = prepare(f, ['static/selected.txt']);
  assert.notEqual(prepared.status, 0);
  assert.equal(prepared.result.status, 'failed');
  const receipt = JSON.parse(fs.readFileSync(prepared.result.receipt, 'utf8'));
  assert.equal(receipt.revision, null);
  assert.equal(receipt.status, 'failed');
  assert.deepEqual(snapshot(f.source), before);
});

test('missing privacy approval prevents the prepared candidate becoming ready', (t) => {
  const f = fixture(t);
  const relativePath = 'content/writing/needs-privacy-review.md';
  fs.writeFileSync(path.join(f.source, relativePath), '---\ntitle: "Privacy review fixture"\ndraft: false\npublication:\n  status: "approved"\n  reviewed_by: "Fixture reviewer"\n  reviewed_at: "2026-08-09"\n  privacy_reviewed: false\n---\n\nGeneric test article.\n');
  const prepared = prepare(f, [relativePath], { SITE_CONTENT_DIR: path.join(f.source, 'tests/fixtures/writing') });
  assert.notEqual(prepared.status, 0);
  const receipt = JSON.parse(fs.readFileSync(prepared.result.receipt, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.checks.build, 'failed');
  assert.equal(receipt.checks.acceptance, 'pending');
  assert.match(fs.readFileSync(receipt.logs.build, 'utf8'), /privacy_reviewed/);
  assert.ok(fs.existsSync(path.join(f.source, relativePath)));
});

test('a failed complete acceptance command leaves a failed candidate and its logs', (t) => {
  const f = fixture(t);
  const relativePath = 'tests/workflow/aaa-required-check.sh';
  fs.writeFileSync(path.join(f.source, relativePath), '#!/usr/bin/env bash\necho "Required acceptance fixture failure" >&2\nexit 1\n');
  const prepared = prepare(f, [relativePath]);
  assert.notEqual(prepared.status, 0);
  const receipt = JSON.parse(fs.readFileSync(prepared.result.receipt, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.checks.build, 'passed');
  assert.equal(receipt.checks.acceptance, 'failed');
  assert.equal(receipt.checks.release, 'pending');
  assert.match(fs.readFileSync(receipt.logs.acceptance, 'utf8'), /Required acceptance fixture failure/);
});

test('acceptance cannot mark an altered canonical artifact ready', (t) => {
  const f = fixture(t);
  const relativePath = 'tests/workflow/zz-alter-canonical-artifact.sh';
  fs.writeFileSync(path.join(f.source, relativePath), '#!/usr/bin/env bash\nprintf "\\n<!-- altered during checks -->\\n" >> "$PLAYWRIGHT_PRODUCTION_ARTIFACT/index.html"\n');
  const prepared = prepare(f, [relativePath]);
  assert.notEqual(prepared.status, 0);
  const receipt = JSON.parse(fs.readFileSync(prepared.result.receipt, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.checks.build, 'passed');
  assert.equal(receipt.checks.acceptance, 'passed');
  assert.equal(receipt.checks.artifact, 'failed');
  assert.equal(receipt.checks.release, 'pending');
  assert.match(prepared.result.error, /artifact changed after acceptance/);
});

test('a removed directory is refused as an exact-file selection', (t) => {
  const f = fixture(t);
  const directory = path.join(f.source, 'static/new-directory');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'note.txt'), 'unpublished directory file\n');
  git(f.source, 'add', 'static/new-directory');
  git(f.source, 'commit', '-qm', 'Unpublished directory');
  fs.rmSync(directory, { recursive: true });
  const prepared = prepare(f, ['static/new-directory']);
  assert.notEqual(prepared.status, 0);
  assert.equal(prepared.result.receipt, null);
  assert.match(prepared.result.error, /regular file/);
});
