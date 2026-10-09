const assert = require('node:assert/strict');
const { execFile, execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const { promisify } = require('node:util');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const command = path.resolve(__dirname, '../../scripts/scheduled-publication.js');
const commit = '1111111111111111111111111111111111111111';
const before = '2030-06-01T06:59:00Z';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduled-publication-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'content'), { recursive: true });
  fs.writeFileSync(path.join(root, 'hugo.toml'), 'timeZone = "Europe/Madrid"\n');
  fs.writeFileSync(path.join(root, 'content/scheduled.md'), `---
title: "Scheduled fixture"
date: 2030-06-01T09:00:00
publishDate: 2030-06-01T09:00:00
draft: false
publication:
  status: "approved"
  reviewed_by: "Test reviewer"
  reviewed_at: "2030-05-31"
  privacy_reviewed: true
---
Fixture.
`);
  // This is an independent last-success record, not output from the decision command.
  const state = path.join(root, 'last-success.json');
  fs.writeFileSync(state, JSON.stringify({
    version: 1,
    commit,
    clock: before,
    pages: [{ id: 'scheduled', publishDate: '2030-06-01T09:00:00+02:00', expiryDate: null }],
    published: [],
  }));
  return { root, state };
}

function published(root, clock) {
  return execFileSync('hugo', ['list', 'published', '--source', root, '--environment', 'production', '--clock', clock, '--noBuildLock'], { encoding: 'utf8' });
}

function decide(state, clock = before, event = 'schedule', sha = commit, extra = []) {
  const result = spawnSync(process.execPath, [command, 'decide', '--state', state, '--clock', clock, '--event', event, '--commit', sha, ...extra], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('an unchanged hourly run skips while an approved article is still future', t => {
  const { root, state } = fixture(t);
  assert.equal(published(root, before).includes('content/scheduled.md'), false);
  assert.deepEqual(decide(state), {
    publish: false,
    reason: 'Publishable content matches the last successful deployment.',
    clock: before,
  });
});

test('a newly due approved article requests publication and reports the decision to Actions', t => {
  const { root, state } = fixture(t);
  const due = '2030-06-01T07:00:00Z';
  assert.equal(published(root, due).includes('content/scheduled.md'), true);
  const output = path.join(root, 'github-output');
  const summary = path.join(root, 'github-summary');
  assert.deepEqual(decide(state, due, 'schedule', commit, ['--github-output', output, '--summary', summary]), {
    publish: true,
    reason: 'Publishable content changed since the last successful deployment.',
    clock: due,
  });
  assert.equal(fs.readFileSync(output, 'utf8'), `publish=true\nclock=${due}\n`);
  assert.match(fs.readFileSync(summary, 'utf8'), /Publishable content changed since the last successful deployment\./);
});

test('a missed or failed hourly attempt leaves overdue content pending against the last success', t => {
  const { root, state } = fixture(t);
  const lastSuccess = fs.readFileSync(state, 'utf8');
  const later = '2030-06-03T07:30:00Z';
  assert.equal(published(root, later).includes('content/scheduled.md'), true);
  // A failed attempt is separate from the last deployment, even with a later clock.
  fs.writeFileSync(path.join(root, 'failed-attempt.json'), JSON.stringify({ clock: later, published: ['scheduled'] }));
  assert.equal(decide(state, later).publish, true);
  assert.equal(decide(state, later).publish, true);
  assert.equal(fs.readFileSync(state, 'utf8'), lastSuccess);
  assert.deepEqual(decide(path.join(root, 'missing-last-success.json'), later), {
    publish: true,
    reason: 'No usable last successful deployment state is available.',
    clock: later,
  });
});

test('push and manual publication always retain the full release path', t => {
  const { state } = fixture(t);
  for (const event of ['push', 'workflow_dispatch']) {
    assert.deepEqual(decide(state, before, event), {
      publish: true,
      reason: 'Push and manual publication run the complete release workflow.',
      clock: before,
    });
  }
});

test('unpublished repository changes run the gates even before the next article is due', t => {
  const { state } = fixture(t);
  assert.deepEqual(decide(state, before, 'schedule', '2222222222222222222222222222222222222222'), {
    publish: true,
    reason: 'Repository changes have not reached a successful deployment.',
    clock: before,
  });
});

test('unusable deployment state conservatively requests a complete publication', t => {
  const { state } = fixture(t);
  const good = JSON.parse(fs.readFileSync(state, 'utf8'));
  for (const unusable of [
    {},
    { ...good, version: 2 },
    { ...good, clock: 'invalid' },
    { ...good, clock: '2031-01-01T00:00:00Z' },
    { ...good, published: ['scheduled'] },
    { ...good, pages: [{ id: 'scheduled', publishDate: 'invalid', expiryDate: null }] },
  ]) {
    fs.writeFileSync(state, JSON.stringify(unusable));
    assert.deepEqual(decide(state), {
      publish: true,
      reason: 'No usable last successful deployment state is available.',
      clock: before,
    });
  }
});

test('the decision uses Hugo-resolved dates and ignores drafts in the successful deployment snapshot', t => {
  const { root } = fixture(t);
  const scheduled = path.join(root, 'content/scheduled.md');
  fs.writeFileSync(scheduled, fs.readFileSync(scheduled, 'utf8').replaceAll('2030-06-01', '2030-06-02'));
  fs.writeFileSync(path.join(root, 'content/draft.md'), `---
title: "Private draft fixture"
date: 2030-06-01T09:00:00
draft: true
---
Draft.
`);
  // No publishDate: Hugo resolves date in Europe/Madrid, including the summer offset.
  fs.writeFileSync(path.join(root, 'content/expiring.md'), `---
title: "Expiry fixture"
date: 2030-05-01T09:00:00
expiryDate: 2030-06-01T09:00:00
---
Expiry.
`);
  const state = path.join(root, 'publication-state.json');
  const capture = spawnSync(process.execPath, [command, 'capture', '--source', root, '--commit', commit, '--clock', before, '--output', state], { encoding: 'utf8' });
  assert.equal(capture.status, 0, capture.stderr);
  assert.equal(decide(state).publish, false);
  const atExpiry = '2030-06-01T07:00:00Z';
  assert.equal(published(root, atExpiry).includes('content/expiring.md'), false);
  assert.equal(decide(state, atExpiry).publish, true);
  const afterExpiry = '2030-06-01T07:00:01Z';
  assert.equal(published(root, afterExpiry).includes('content/expiring.md'), false);
  assert.equal(published(root, afterExpiry).includes('content/draft.md'), false);
  assert.equal(decide(state, afterExpiry).publish, true);
  const recorded = fs.readFileSync(state, 'utf8');
  assert.equal(recorded.includes('Private draft fixture'), false);
  assert.equal(recorded.includes('content/'), false);
});

test('hourly lookup compares with the last successful Pages deployment, never a newer failed run', async t => {
  const { root, state } = fixture(t);
  const archive = path.join(root, 'success.zip');
  fs.copyFileSync(state, path.join(root, 'publication-state.json'));
  execFileSync('zip', ['-jq', archive, path.join(root, 'publication-state.json')]);
  let missingState = false;
  let inaccessible = false;
  const server = http.createServer((request, response) => {
    if (inaccessible) { response.statusCode = 403; response.end('Access denied'); return; }
    const url = new URL(request.url, 'http://localhost');
    const prefix = '/repos/fixture/site';
    let body;
    if (url.pathname === `${prefix}/deployments`) {
      body = [2, 1].map(id => ({ id, sha: commit, environment: 'github-pages',
        created_at: id === 2 ? '2030-06-02T07:30:00Z' : before }));
    } else if (/\/deployments\/[12]\/statuses$/.test(url.pathname)) {
      const id = url.pathname.includes('/deployments/1/') ? 1 : 2;
      body = [{ state: id === 1 ? 'success' : 'failure', log_url: `https://github.com/fixture/site/actions/runs/${id}/job/${id}` }];
    } else if (/\/actions\/jobs\/[12]$/.test(url.pathname)) {
      const id = url.pathname.endsWith('/1') ? 1 : 2;
      body = { name: 'deploy', run_id: id, steps: [{ name: 'Deploy to GitHub Pages', conclusion: id === 1 ? 'success' : 'failure' }] };
    } else if (/\/actions\/runs\/[12]$/.test(url.pathname)) {
      body = { path: '.github/workflows/hugo.yaml', head_sha: commit };
    } else if (url.pathname === `${prefix}/actions/runs/1/artifacts`) {
      body = { artifacts: missingState ? [] : [{ id: 1, name: 'publication-success-state', expired: false, created_at: before,
        workflow_run: { id: 1, head_sha: commit } }] };
    } else if (url.pathname === `${prefix}/actions/artifacts/1/zip`) {
      response.end(fs.readFileSync(archive));
      return;
    } else {
      response.statusCode = 404;
      response.end('Unexpected request');
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function remoteDecision(clock) {
    const { stdout } = await promisify(execFile)(process.execPath, [command, 'decide', '--event', 'schedule', '--commit', commit,
      '--clock', clock, '--repository', 'fixture/site', '--api-url', `http://127.0.0.1:${server.address().port}`],
      { encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: 'fixture-token' }, timeout: 10000 });
    return JSON.parse(stdout);
  }
  assert.deepEqual(await remoteDecision(before), {
    publish: false,
    reason: 'Publishable content matches the last successful deployment.',
    clock: before,
  });
  const later = '2030-06-03T07:30:00Z';
  assert.deepEqual(await remoteDecision(later), {
    publish: true,
    reason: 'Publishable content changed since the last successful deployment.',
    clock: later,
  });
  missingState = true;
  assert.deepEqual(await remoteDecision(later), {
    publish: true,
    reason: 'No usable last successful deployment state is available.',
    clock: later,
  });
  inaccessible = true;
  assert.deepEqual(await remoteDecision(later), {
    publish: true,
    reason: 'No usable last successful deployment state is available.',
    clock: later,
  });
});
