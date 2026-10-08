#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let receipt;
let receiptPath;
let currentCheck;
const preparationStartedAt = Date.now();
const releaseEnv = { ...process.env };
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
  delete releaseEnv[name];
}

function run(program, args, cwd, env = releaseEnv, preserveOutput = false) {
  const result = spawnSync(program, args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout).trim();
    if (receipt?.logs.preparation) fs.appendFileSync(receipt.logs.preparation, `${program} ${args.join(' ')}\n${details}\n`);
    throw new Error(`${program} failed: ${details.split('\n')[0]}`);
  }
  return preserveOutput ? result.stdout : result.stdout.trim();
}

function git(cwd, args, env, preserveOutput) {
  return run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], cwd, env, preserveOutput);
}

function saveReceipt() {
  const temporary = `${receiptPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporary, receiptPath);
}

function check(name, program, args, env) {
  currentCheck = name;
  const startedAt = Date.now();
  const logPath = receipt.logs[name];
  const log = fs.openSync(logPath, 'a');
  let result;
  try {
    result = spawnSync(program, args, { cwd: receipt.checkout, env, stdio: ['ignore', log, log] });
  } finally {
    fs.closeSync(log);
  }
  receipt.timings[name] += (Date.now() - startedAt) / 1000;
  if (result.error || result.status !== 0) throw new Error(`${name} check failed; see ${logPath}`);
  receipt.checks[name] = 'passed';
  saveReceipt();
}

function digest() {
  const startedAt = Date.now();
  const value = run(process.execPath, ['scripts/release-artifact-digest.js', receipt.artifact.directory], receipt.checkout);
  receipt.timings.artifact += (Date.now() - startedAt) / 1000;
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Artifact digest is invalid');
  return value;
}

function result() {
  return {
    candidateId: receipt?.candidateId || null,
    status: receipt?.status || 'failed',
    receipt: receiptPath || null,
    checkout: receipt?.checkout || null,
    revision: receipt?.revision || null,
    checks: receipt?.checks || null,
    timings: receipt?.timings || null,
    error: receipt?.failure || undefined,
  };
}

try {
  let output;
  let remote = 'origin';
  let branch = 'master';
  let paths = [];
  const args = process.argv.slice(2);
  while (args.length) {
    const option = args.shift();
    if (option === '--') {
      paths = args;
      break;
    }
    if (option === '--help') {
      console.log('Usage: node scripts/prepare-release.js [--output <new directory>] [--remote origin] [--branch master] -- <exact relative paths...>');
      process.exit(0);
    }
    if (!['--output', '--remote', '--branch'].includes(option) || !args.length) throw new Error(`Invalid option: ${option}`);
    const value = args.shift();
    if (option === '--output') output = value;
    if (option === '--remote') remote = value;
    if (option === '--branch') branch = value;
  }
  if (!paths.length) throw new Error('Select at least one exact relative file path after --');
  paths = [...new Set(paths)];
  const sourceRepoRoot = fs.realpathSync(git(process.cwd(), ['rev-parse', '--show-toplevel']));
  git(sourceRepoRoot, ['check-ref-format', `refs/remotes/${remote}/${branch}`]);
  if (remote.startsWith('-') || branch.startsWith('-')) throw new Error('Invalid publication remote or branch');
  const baseRevision = git(sourceRepoRoot, ['rev-parse', '--verify', `refs/remotes/${remote}/${branch}^{commit}`]);
  const sourceRevision = git(sourceRepoRoot, ['rev-parse', 'HEAD']);
  for (const selectedPath of paths) {
    if (path.isAbsolute(selectedPath) || selectedPath.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git') || selectedPath.includes('\\') || /[\x00-\x1f]/.test(selectedPath)) {
      throw new Error(`Select an exact repository-relative file path: ${selectedPath}`);
    }
    const absolutePath = path.join(sourceRepoRoot, selectedPath);
    const tracked = git(sourceRepoRoot, ['ls-tree', 'HEAD', '--', selectedPath], { ...releaseEnv, GIT_LITERAL_PATHSPECS: '1' });
    if (tracked.startsWith('160000 ')) throw new Error(`Select files, not a submodule: ${selectedPath}`);
    if (tracked && !/^(100644|100755) /.test(tracked)) throw new Error(`Select a regular file, not a directory or symlink: ${selectedPath}`);
    if (fs.existsSync(absolutePath)) {
      const entry = fs.lstatSync(absolutePath);
      if (!entry.isFile()) throw new Error(`Select a regular file, not a directory or symlink: ${selectedPath}`);
    } else if (!tracked) {
      throw new Error(`Selected file does not exist: ${selectedPath}`);
    }
  }

  const candidateId = crypto.randomUUID();
  output = path.resolve(output || path.join(os.tmpdir(), `release-candidate-${candidateId}`));
  output = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
  if (output === sourceRepoRoot || output.startsWith(`${sourceRepoRoot}${path.sep}`)) throw new Error('Candidate directory must be outside the source checkout');
  fs.mkdirSync(output);
  const logsDirectory = path.join(output, 'logs');
  fs.mkdirSync(logsDirectory);
  receiptPath = path.join(output, 'candidate.json');
  receipt = {
    schemaVersion: 1, candidateId, status: 'preparing', createdAt: new Date().toISOString(),
    sourceRepoRoot, publication: { remote, branch, baseRevision },
    selection: { sourceRevision, paths }, checkout: path.join(output, 'checkout'),
    revision: null, tree: null, artifact: { directory: path.join(output, 'checkout/public'), digest: null },
    checks: { build: 'pending', acceptance: 'pending', release: 'pending', artifact: 'pending', source: 'pending' },
    timings: { build: 0, acceptance: 0, release: 0, artifact: 0, source: 0, total: 0 },
    logs: Object.fromEntries(['preparation', 'build', 'acceptance', 'release'].map((name) => [name, path.join(logsDirectory, `${name}.log`)])),
  };
  saveReceipt();

  // A private index captures selected working-tree edits against HEAD without
  // changing the user's staged work or including unpublished commit history.
  const indexDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-selection-'));
  let patch;
  try {
    const selectionEnv = { ...releaseEnv, GIT_INDEX_FILE: path.join(indexDirectory, 'index'), GIT_LITERAL_PATHSPECS: '1' };
    git(sourceRepoRoot, ['read-tree', sourceRevision], selectionEnv);
    git(sourceRepoRoot, ['add', '--', ...paths], selectionEnv);
    patch = git(sourceRepoRoot, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', sourceRevision, '--', ...paths], selectionEnv, true);
  } finally {
    fs.rmSync(indexDirectory, { recursive: true, force: true });
  }
  if (!patch) throw new Error('Selected paths contain no local changes relative to HEAD');
  const patchPath = path.join(output, 'selected.patch');
  fs.writeFileSync(patchPath, patch);
  git(sourceRepoRoot, ['worktree', 'add', '--detach', receipt.checkout, baseRevision]);
  git(receipt.checkout, ['apply', '--index', '--binary', patchPath]);
  git(receipt.checkout, ['-c', 'user.name=Release preparation', '-c', 'user.email=release-preparation@users.noreply.github.com', 'commit', '-qm', 'Prepare selected release changes']);
  receipt.revision = git(receipt.checkout, ['rev-parse', 'HEAD']);
  receipt.tree = git(receipt.checkout, ['rev-parse', 'HEAD^{tree}']);
  saveReceipt();

  const checkEnv = { ...releaseEnv, PLAYWRIGHT_PRODUCTION_ARTIFACT: receipt.artifact.directory };
  // Content and fixed-clock overrides are for fixtures, never release candidates.
  delete checkEnv.SITE_CONTENT_DIR;
  delete checkEnv.SITE_BUILD_CLOCK;
  delete checkEnv.HUGO_BUILD_COUNT_FILE;
  delete checkEnv.GITHUB_STEP_SUMMARY;
  checkEnv.HUGO_CACHE_DIR = path.join(output, 'hugo-cache');
  delete checkEnv.GIT_INDEX_FILE;
  delete checkEnv.GIT_WORK_TREE;
  delete checkEnv.GIT_DIR;
  currentCheck = 'build';
  check('build', 'git', ['submodule', 'update', '--init', '--recursive'], checkEnv);
  check('build', 'npm', ['ci', '--no-audit', '--no-fund'], checkEnv);
  check('build', 'bash', ['scripts/build-production.sh', 'public'], checkEnv);
  currentCheck = 'artifact';
  receipt.artifact.digest = digest();
  saveReceipt();
  check('acceptance', 'npm', ['test'], checkEnv);
  currentCheck = 'artifact';
  if (digest() !== receipt.artifact.digest) throw new Error('Production artifact changed after acceptance');
  check('release', 'bash', ['scripts/verify-production-release.sh', 'public'], checkEnv);
  currentCheck = 'artifact';
  if (digest() !== receipt.artifact.digest) throw new Error('Production artifact changed after release verification');
  receipt.checks.artifact = 'passed';
  currentCheck = 'source';
  const sourceCheckStartedAt = Date.now();
  if (git(receipt.checkout, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'])) throw new Error('Candidate source changed during verification');
  if (git(receipt.checkout, ['rev-parse', 'HEAD']) !== receipt.revision) throw new Error('Candidate revision changed during verification');
  receipt.timings.source = (Date.now() - sourceCheckStartedAt) / 1000;
  receipt.timings.total = (Date.now() - preparationStartedAt) / 1000;
  receipt.checks.source = 'passed';
  receipt.status = 'ready';
  receipt.readyAt = new Date().toISOString();
  saveReceipt();
  console.log(JSON.stringify(result()));
} catch (error) {
  if (receipt) {
    receipt.status = 'failed';
    receipt.failure = error.message;
    receipt.failedAt = new Date().toISOString();
    receipt.timings.total = (Date.now() - preparationStartedAt) / 1000;
    if (currentCheck) receipt.checks[currentCheck] = 'failed';
    saveReceipt();
  }
  const outcome = result();
  outcome.error = error.message;
  console.error(`Release preparation failed: ${error.message}`);
  console.log(JSON.stringify(outcome));
  process.exitCode = 1;
}
