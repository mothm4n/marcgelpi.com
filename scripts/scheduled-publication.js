#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const [mode, ...args] = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  options[args[index].replace(/^--/, '')] = args[index + 1];
}

function eligiblePages(state, clock) {
  return state.pages
    .filter(page => (!page.publishDate || Date.parse(page.publishDate) <= clock)
      && (!page.expiryDate || Date.parse(page.expiryDate) > clock))
    .map(page => page.id).sort();
}

function usableState(state, clock) {
  if (!state || state.version !== 1 || !/^[a-f0-9]{40}$/.test(state.commit)
    || !Number.isFinite(Date.parse(state.clock)) || Date.parse(state.clock) > clock
    || !Array.isArray(state.pages) || !Array.isArray(state.published)) return false;
  const ids = new Set();
  for (const page of state.pages) {
    if (!page || typeof page.id !== 'string' || !page.id || ids.has(page.id)
      || !['publishDate', 'expiryDate'].every(field => page[field] === null
        || (typeof page[field] === 'string' && Number.isFinite(Date.parse(page[field]))))) return false;
    ids.add(page.id);
  }
  if (state.published.some(id => typeof id !== 'string' || !ids.has(id))
    || new Set(state.published).size !== state.published.length) return false;
  // A mismatch means the snapshot cannot safely describe this site's date rules.
  return JSON.stringify(eligiblePages(state, Date.parse(state.clock)))
    === JSON.stringify([...state.published].sort());
}

const clock = options.clock || new Date().toISOString();
const now = Date.parse(clock);
if (!Number.isFinite(now) || !/^[a-f0-9]{40}$/.test(options.commit)) {
  throw new Error('A valid publication clock and commit are required.');
}
function hugoRows(source, kind, clock) {
  const csv = execFileSync('bash', [path.join(__dirname, 'run-hugo.sh'), 'list', kind, '--source', source, '--environment', 'production', '--clock', clock, '--noBuildLock'], { encoding: 'utf8' });
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field);
      field = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else field += char;
  }
  if (quoted) throw new Error('Invalid Hugo publication list.');
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  if (!['path', 'draft', 'publishDate', 'expiryDate'].every(header => headers?.includes(header))) {
    throw new Error('Missing Hugo publication fields.');
  }
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function capture() {
  const source = options.source || path.resolve(__dirname, '..');
  const id = row => crypto.createHash('sha256').update(row.path).digest('hex');
  const date = value => value === '0001-01-01T00:00:00Z' ? null : value;
  const state = {
    version: 1,
    commit: options.commit,
    clock,
    pages: hugoRows(source, 'all', clock).filter(row => row.draft === 'false').map(row => ({
      id: id(row), publishDate: date(row.publishDate), expiryDate: date(row.expiryDate),
    })),
    published: hugoRows(source, 'published', clock).map(id).sort(),
  };
  const json = JSON.stringify(state);
  fs.writeFileSync(options.output, `${json}\n`);
  if (options['github-output']) {
    fs.appendFileSync(options['github-output'], `state=${Buffer.from(json).toString('base64')}\n`);
  }
  console.log('Captured publication dates and opaque content identifiers.');
}

async function lastSuccessfulState() {
  const repository = options.repository || process.env.GITHUB_REPOSITORY;
  const api = options['api-url'] || process.env.GITHUB_API_URL || 'https://api.github.com';
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const prefix = `/repos/${repository}`;
  const request = route => fetch(`${api}${prefix}${route}`, { headers, signal: AbortSignal.timeout(10000), redirect: 'manual' });
  async function json(route) {
    const response = await request(route);
    if (!response.ok) throw new Error('Deployment state unavailable.');
    return response.json();
  }
  async function list(route, field) {
    const entries = [];
    for (let page = 1; ; page += 1) {
      const response = await json(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const values = field ? response[field] : response;
      if (!Array.isArray(values)) throw new Error('Invalid deployment response.');
      entries.push(...values);
      if (values.length < 100) return entries;
    }
  }
  const deployments = await list('/deployments?environment=github-pages');
  deployments.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  for (const deployment of deployments) {
    const statuses = await list(`/deployments/${deployment.id}/statuses`);
    // GitHub's environment status links to the Actions job that performed the deployment.
    const status = statuses.find(entry => entry.log_url);
    if (!status) continue;
    const jobURL = new URL(status.log_url);
    const match = jobURL.pathname.match(/^\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)\/job\/(\d+)$/);
    if (jobURL.hostname !== 'github.com' || !match || match[1] !== repository) continue;
    const job = await json(`/actions/jobs/${match[3]}`);
    if (job.run_id !== Number(match[2]) || !job.steps?.some(step => step.name === 'Deploy to GitHub Pages' && step.conclusion === 'success')) continue;
    // Once Pages succeeded, unavailable state must force a release, never select an older deployment.
    const run = await json(`/actions/runs/${job.run_id}`);
    if (run.path?.split('@')[0] !== '.github/workflows/hugo.yaml' || run.head_sha !== deployment.sha) return null;
    const artifacts = await list(`/actions/runs/${job.run_id}/artifacts`, 'artifacts');
    const artifact = artifacts.filter(entry => entry.name === 'publication-success-state')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!artifact || artifact.expired || artifact.workflow_run?.head_sha !== deployment.sha
      || Date.parse(artifact.created_at) < Date.parse(deployment.created_at)) return null;
    let response = await request(`/actions/artifacts/${artifact.id}/zip`);
    if (response.status === 302) {
      // The signed storage URL must never receive the GitHub token.
      response = await fetch(response.headers.get('location'), { signal: AbortSignal.timeout(10000) });
    }
    if (!response.ok) return null;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-state-'));
    try {
      const archive = path.join(directory, 'state.zip');
      fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
      const state = JSON.parse(execFileSync('unzip', ['-p', archive, 'publication-state.json'], { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
      return state.commit === deployment.sha && Date.parse(state.clock) <= Date.parse(deployment.created_at) ? state : null;
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
  return null;
}

async function main() {
  if (mode === 'capture') {
    capture();
    return;
  }
  if (mode !== 'decide') throw new Error('Expected decide or capture command.');
  let state = null;
  if (options.event === 'schedule') {
    try {
      state = options.state ? JSON.parse(fs.readFileSync(options.state, 'utf8')) : await lastSuccessfulState();
    } catch { /* An inaccessible state safely selects the full release path. */ }
  }
  if (!usableState(state, now)) state = null;
  const changed = !state || JSON.stringify(eligiblePages(state, now))
    !== JSON.stringify([...state.published].sort());
  const decision = {
    publish: options.event !== 'schedule' || changed || state.commit !== options.commit,
    reason: options.event !== 'schedule' ? 'Push and manual publication run the complete release workflow.'
      : !state ? 'No usable last successful deployment state is available.'
      : state.commit !== options.commit ? 'Repository changes have not reached a successful deployment.'
      : changed ? 'Publishable content changed since the last successful deployment.'
      : 'Publishable content matches the last successful deployment.',
    clock,
  };
  if (options['github-output']) {
    fs.appendFileSync(options['github-output'], `publish=${decision.publish}\nclock=${decision.clock}\n`);
  }
  if (options.summary) {
    fs.appendFileSync(options.summary, `## Scheduled publication\n\n${decision.publish ? 'Publish' : 'Skip'}: ${decision.reason}\n`);
  }
  console.log(JSON.stringify(decision));
}

main().catch(() => {
  console.error('Publication decision command failed.');
  process.exitCode = 1;
});
