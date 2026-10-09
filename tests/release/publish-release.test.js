const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { run, git, createReleaseSource, commitPublishedBaseline } = require('./release-fixture');

const repository = path.resolve(__dirname, '../..');
const command = path.join(repository, 'scripts/publish-release.js');

function installAdapters(bin) {
  fs.writeFileSync(path.join(bin, 'gh'), `#!${process.execPath}\nconst fs = require('node:fs');\nconst fixture = JSON.parse(fs.readFileSync(process.env.PUBLICATION_API_FIXTURE, 'utf8'));\nconst args = process.argv.slice(2);\nlet value;\nif (args[0] === 'repo' && args[1] === 'view') value = fixture.repository;\nelse if (args[0] === 'api' && args[1].includes('/actions/')) value = fixture.runs;\nelse if (args[0] === 'api' && args[1].includes('/statuses')) value = fixture.statuses;\nelse if (args[0] === 'api' && args[1].includes('/deployments?environment=')) value = fixture.currentDeployments || fixture.deployments;\nelse if (args[0] === 'api' && args[1].includes('/deployments')) value = fixture.deployments;\nelse throw new Error('Unexpected external GitHub request: ' + args.join(' '));\nprocess.stdout.write(JSON.stringify(value));\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'curl'), `#!${process.execPath}\nconst fs = require('node:fs');\nconst fixture = JSON.parse(fs.readFileSync(process.env.PUBLICATION_API_FIXTURE, 'utf8'));\nif (fixture.httpsTransitionTo) { fixture.statuses[0].state = fixture.httpsTransitionTo; fs.writeFileSync(process.env.PUBLICATION_API_FIXTURE, JSON.stringify(fixture)); }\nprocess.stdout.write(fixture.https);\n`, { mode: 0o755 });
}

function readyFixture(t) {
  // Optional local reuse speeds TDD iterations. The default suite always prepares
  // a fresh candidate through every real gate and removes its temporary repo.
  const reuseRoot = process.env.PUBLICATION_TEST_FIXTURE_ROOT;
  if (reuseRoot && fs.existsSync(path.join(reuseRoot, 'fixture.json'))) {
    const f = JSON.parse(fs.readFileSync(path.join(reuseRoot, 'fixture.json'), 'utf8'));
    assert.equal(f.remote, path.join(f.root, 'origin.git'));
    assert.equal(git(f.source, 'remote', 'get-url', '--push', 'origin'), f.remote);
    installAdapters(f.bin);
    git(f.source, 'reset', '--hard', f.baseline);
    git(f.remote, 'update-ref', 'refs/heads/master', f.baseline);
    fs.writeFileSync(f.apiPath, JSON.stringify(f.api));
    fs.writeFileSync(f.receiptPath, JSON.stringify(f.receipt));
    return f;
  }
  const root = reuseRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'release-publication-test-'));
  if (reuseRoot) fs.mkdirSync(root);
  else t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = createReleaseSource(root);
  fs.writeFileSync(path.join(source, 'static/publisher-fixture.txt'), 'published baseline\n');
  const baseline = commitPublishedBaseline(source);
  const remote = path.join(root, 'origin.git');
  run('git', ['init', '--bare', remote], root);
  git(source, 'remote', 'add', 'origin', remote);
  git(source, 'push', 'origin', 'master');
  fs.writeFileSync(path.join(source, 'static/publisher-fixture.txt'), 'approved candidate\n');
  const prepared = JSON.parse(run(process.execPath, [path.join(repository, 'scripts/prepare-release.js'), '--output', path.join(root, 'candidate'), '--', 'static/publisher-fixture.txt'], source, {
    env: { ...process.env, SITE_TEST_PORT: '4911', SITE_PREVIEW_TEST_PORT: '4912' },
  }));
  assert.equal(prepared.status, 'ready');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  installAdapters(bin);
  const receipt = JSON.parse(fs.readFileSync(prepared.receipt, 'utf8'));
  const apiPath = path.join(root, 'github.json');
  const api = {
    repository: { nameWithOwner: 'example/site', url: 'https://github.com/example/site' },
    runs: { workflow_runs: [{ id: 101, head_sha: receipt.revision, head_branch: 'master', event: 'push', path: '.github/workflows/hugo.yaml', status: 'completed', conclusion: 'success', html_url: 'https://github.com/example/site/actions/runs/101' }] },
    deployments: [{ id: 201, sha: receipt.revision, environment: 'github-pages' }],
    statuses: [{ id: 301, state: 'success', environment_url: 'https://marcgelpi.com', log_url: 'https://github.com/example/site/actions/runs/101' }],
    https: '200\nhttps://marcgelpi.com/\n',
  };
  fs.writeFileSync(apiPath, JSON.stringify(api));
  const f = { root, source, remote, baseline, bin, api, apiPath, receiptPath: prepared.receipt, receipt };
  if (reuseRoot) fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify(f));
  return f;
}

function publish(f, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [command, f.receiptPath, '--approve', f.receipt.candidateId, ...args], {
    cwd: f.source, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, PUBLICATION_API_FIXTURE: f.apiPath, ...extraEnv },
  });
  assert.ok(result.stdout.trim(), result.stderr);
  return { ...result, outcome: JSON.parse(result.stdout) };
}

function resetPublication(f, api = f.api) {
  git(f.remote, 'update-ref', 'refs/heads/master', f.baseline);
  fs.writeFileSync(f.apiPath, JSON.stringify(api));
  fs.writeFileSync(f.receiptPath, JSON.stringify(f.receipt));
}

function assertNotSubmitted(f, result, reason) {
  assert.notEqual(result.status, 0);
  assert.equal(result.outcome.status, 'action_required');
  assert.equal(result.outcome.pushed, false);
  assert.match(result.outcome.reason, reason);
  assert.equal(git(f.remote, 'rev-parse', 'refs/heads/master'), f.baseline);
}

test('publication requires approval of the specific candidate identity', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-publication-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const receipt = path.join(root, 'candidate.json');
  fs.writeFileSync(receipt, JSON.stringify({ candidateId: 'candidate-to-review' }));
  const result = spawnSync(process.execPath, [command, receipt], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.ok(result.stdout.trim(), result.stderr);
  const outcome = JSON.parse(result.stdout);
  assert.equal(outcome.status, 'action_required');
  assert.match(outcome.reason, /approve.*candidate/i);
  assert.equal(outcome.pushed, false);
});

test('prepared publication checks the real remote branch before submitting', async (t) => {
  const f = readyFixture(t);
  await t.test('an advanced branch is preserved and requires a fresh candidate', () => {
    fs.writeFileSync(path.join(f.source, 'static/remote-change.txt'), 'independent publication\n');
    git(f.source, 'add', 'static/remote-change.txt');
    git(f.source, 'commit', '-qm', 'Independent branch advancement');
    git(f.source, 'push', 'origin', 'master');
    const advanced = git(f.source, 'rev-parse', 'HEAD');
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'action_required');
    assert.match(result.outcome.reason, /branch.*advanced/i);
    assert.equal(result.outcome.pushed, false);
    assert.equal(git(f.remote, 'rev-parse', 'refs/heads/master'), advanced);
  });
  await t.test('the approved candidate is submitted and confirmed at the deployed revision over HTTPS', () => {
    git(f.remote, 'update-ref', 'refs/heads/master', f.baseline);
    const result = publish(f);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.outcome.status, 'success');
    assert.equal(result.outcome.revision, f.receipt.revision);
    assert.equal(result.outcome.deployedRevision, f.receipt.revision);
    assert.equal(result.outcome.deploymentUrl, 'https://github.com/example/site/actions/runs/101');
    assert.deepEqual(result.outcome.https, { url: 'https://marcgelpi.com/', status: 200, passed: true });
    assert.equal(git(f.remote, 'rev-parse', 'refs/heads/master'), f.receipt.revision);
  });
  await t.test('deployment status is checked again after HTTPS verification', () => {
    git(f.remote, 'update-ref', 'refs/heads/master', f.baseline);
    fs.writeFileSync(f.apiPath, JSON.stringify({ ...f.api, httpsTransitionTo: 'failure' }));
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'failed');
    assert.match(result.outcome.reason, /deployment.*failure/i);
    assert.equal(result.outcome.deploymentUrl, 'https://github.com/example/site/actions/runs/101');
  });
  await t.test('HTTPS success requires an actual successful HTTP status', () => {
    git(f.remote, 'update-ref', 'refs/heads/master', f.baseline);
    fs.writeFileSync(f.apiPath, JSON.stringify({ ...f.api, https: 'not-a-status\nhttps://marcgelpi.com/\n' }));
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'failed');
    assert.equal(result.outcome.https.passed, false);
  });
  await t.test('approval for another candidate cannot submit this ready candidate', () => {
    resetPublication(f);
    assertNotSubmitted(f, publish(f, ['--approve', 'another-candidate']), /approve.*candidate/i);
  });
  await t.test('failed preparation cannot be submitted', () => {
    resetPublication(f);
    fs.writeFileSync(f.receiptPath, JSON.stringify({ ...f.receipt, status: 'failed', checks: { ...f.receipt.checks, acceptance: 'failed' } }));
    assertNotSubmitted(f, publish(f), /all checks passed/i);
  });
  await t.test('a changed canonical artifact cannot be submitted', () => {
    resetPublication(f);
    const artifact = path.join(f.receipt.artifact.directory, 'index.html');
    const original = fs.readFileSync(artifact);
    try {
      fs.appendFileSync(artifact, '\n<!-- changed after review -->\n');
      assertNotSubmitted(f, publish(f), /artifact changed/i);
    } finally { fs.writeFileSync(artifact, original); }
  });
  await t.test('changed candidate source cannot be submitted', () => {
    resetPublication(f);
    const source = path.join(f.receipt.checkout, 'static/publisher-fixture.txt');
    const original = fs.readFileSync(source);
    try {
      fs.appendFileSync(source, 'changed after review\n');
      assertNotSubmitted(f, publish(f), /source changed/i);
    } finally { fs.writeFileSync(source, original); }
  });
  await t.test('untracked candidate source cannot be submitted', () => {
    resetPublication(f);
    const source = path.join(f.receipt.checkout, 'content/writing/unreviewed-fixture.md');
    try {
      fs.writeFileSync(source, 'Unreviewed local source\n');
      assertNotSubmitted(f, publish(f), /source changed/i);
    } finally { fs.unlinkSync(source); }
  });
  await t.test('a branch update racing submission is preserved', () => {
    resetPublication(f);
    const advanced = git(f.source, 'rev-parse', 'HEAD');
    const realGit = run('which', ['git'], repository);
    const wrapper = path.join(f.bin, 'git');
    fs.writeFileSync(wrapper, `#!${process.execPath}\nconst { spawnSync } = require('node:child_process');\nconst args = process.argv.slice(2);\nif (args.includes('push')) { const advanced = spawnSync(${JSON.stringify(realGit)}, ['--git-dir=' + ${JSON.stringify(f.remote)}, 'update-ref', 'refs/heads/master', ${JSON.stringify(advanced)}], { stdio: 'inherit' }); if (advanced.status !== 0) process.exit(advanced.status || 1); }\nconst result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' });\nprocess.exit(result.status === null ? 1 : result.status);\n`, { mode: 0o755 });
    try {
      const result = publish(f);
      assert.notEqual(result.status, 0);
      assert.equal(result.outcome.pushed, false);
      assert.match(result.outcome.reason, /branch advanced during submission/i);
      assert.equal(git(f.remote, 'rev-parse', 'refs/heads/master'), advanced);
    } finally { fs.unlinkSync(wrapper); }
  });
  await t.test('inherited Git checkout variables do not redirect candidate publication', () => {
    resetPublication(f);
    const result = publish(f, [], { GIT_DIR: path.join(f.source, '.git'), GIT_WORK_TREE: f.source, GIT_INDEX_FILE: path.join(f.source, '.git/index'), GIT_COMMON_DIR: path.join(f.source, '.git') });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.outcome.deployedRevision, f.receipt.revision);
  });
  await t.test('a network-path route cannot change the canonical publication domain', () => {
    resetPublication(f);
    assertNotSubmitted(f, publish(f, ['--route', '//elsewhere.invalid/']), /canonical HTTPS domain/i);
  });
  await t.test('a failed deployment reports its result and link', () => {
    resetPublication(f, { ...f.api, statuses: [{ ...f.api.statuses[0], state: 'failure' }] });
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'failed');
    assert.match(result.outcome.reason, /deployment failure/i);
    assert.equal(result.outcome.deploymentUrl, 'https://github.com/example/site/actions/runs/101');
  });
  await t.test('failed GitHub workflow gates prevent a success report', () => {
    resetPublication(f, { ...f.api, runs: { workflow_runs: [{ ...f.api.runs.workflow_runs[0], conclusion: 'failure' }] } });
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'failed');
    assert.match(result.outcome.reason, /workflow failure/i);
    assert.equal(result.outcome.deploymentUrl, 'https://github.com/example/site/actions/runs/101');
  });
  await t.test('GitHub environment approval remains a required action', () => {
    resetPublication(f, { ...f.api, runs: { workflow_runs: [{ ...f.api.runs.workflow_runs[0], status: 'waiting', conclusion: null }] } });
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'action_required');
    assert.match(result.outcome.reason, /workflow requires action/i);
    assert.equal(result.outcome.deploymentUrl, 'https://github.com/example/site/actions/runs/101');
  });
  await t.test('a successful deployment of another revision does not confirm this candidate', () => {
    resetPublication(f, { ...f.api, deployments: [{ ...f.api.deployments[0], sha: f.baseline }] });
    const result = publish(f, ['--timeout', '0.05', '--poll-interval', '0.01']);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'action_required');
    assert.match(result.outcome.reason, /confirming the approved deployment/i);
    assert.equal(result.outcome.deploymentUrl, 'https://github.com/example/site/actions/runs/101');
  });
  await t.test('a superseded current deployment cannot report publication success', () => {
    resetPublication(f, { ...f.api, currentDeployments: [{ ...f.api.deployments[0], id: 202, sha: f.baseline }] });
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.equal(result.outcome.status, 'action_required');
    assert.match(result.outcome.reason, /no longer the current deployment/i);
  });
});
