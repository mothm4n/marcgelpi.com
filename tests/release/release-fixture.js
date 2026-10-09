const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = path.resolve(__dirname, '../..');

function run(program, args, cwd, options = {}) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${program} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function git(cwd, ...args) { return run('git', args, cwd); }

function createReleaseSource(root) {
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
  const theme = path.join(source, 'themes/blowfish');
  fs.mkdirSync(theme, { recursive: true });
  run('tar', ['-xf', themeArchive, '-C', theme], repository);
  fs.rmSync(themeArchive);
  git(source, 'init', '-b', 'master');
  git(source, 'config', 'user.email', 'release-test@example.invalid');
  git(source, 'config', 'user.name', 'Release Test');
  return source;
}

function commitPublishedBaseline(source) {
  git(source, 'add', '.');
  git(source, 'commit', '-qm', 'Published baseline');
  return git(source, 'rev-parse', 'HEAD');
}

module.exports = { run, git, createReleaseSource, commitPublishedBaseline };
