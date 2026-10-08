#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const releaseEnv = { ...process.env };
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete releaseEnv[name];
const outcome = { candidateId: null, revision: null, status: 'action_required', pushed: false };
let reportPath;
let logPath;

function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, env: releaseEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (logPath) fs.appendFileSync(logPath, `${program} ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}\n`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed: ${(result.stderr || result.stdout).trim().split('\n')[0]}`);
  return result.stdout.trim();
}

function git(cwd, args) { return run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], cwd); }
function remoteRevision(receipt, remote) {
  return git(receipt.sourceRepoRoot, ['ls-remote', '--exit-code', '--', remote, `refs/heads/${receipt.publication.branch}`]).split(/\s+/)[0];
}
function api(repository, endpoint, cwd) { return JSON.parse(run('gh', ['api', `repos/${repository}/${endpoint}`], cwd)); }
function newest(entries) { return [...entries].sort((left, right) => right.id - left.id)[0]; }
function stop(reason, status = 'action_required') {
  outcome.status = status;
  throw new Error(reason);
}

function validateCandidate(receipt) {
  if (receipt.schemaVersion !== 1 || receipt.status !== 'ready' ||
      ['build', 'acceptance', 'release', 'artifact', 'source'].some((name) => receipt.checks?.[name] !== 'passed')) {
    stop('Only a prepared candidate with all checks passed can publish');
  }
  for (const value of [receipt.revision, receipt.tree, receipt.publication?.baseRevision]) {
    if (!/^[a-f0-9]{40}$/.test(value || '')) stop('Candidate revision, tree, or publication base is invalid');
  }
  if (!receipt.publication.remote || receipt.publication.remote.startsWith('-') || !receipt.publication.branch || receipt.publication.branch.startsWith('-')) stop('Publication remote or branch is invalid');
  git(receipt.sourceRepoRoot, ['check-ref-format', `refs/heads/${receipt.publication.branch}`]);
  const sourceRoot = fs.realpathSync(receipt.sourceRepoRoot);
  const checkout = fs.realpathSync(receipt.checkout);
  if (fs.realpathSync(git(sourceRoot, ['rev-parse', '--show-toplevel'])) !== sourceRoot || fs.realpathSync(git(checkout, ['rev-parse', '--show-toplevel'])) !== checkout) stop('Candidate must be a complete Git worktree');
  const common = (cwd) => fs.realpathSync(git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  if (common(sourceRoot) !== common(checkout) || sourceRoot === checkout) stop('Candidate is not a retained worktree of its source repository');
  const registered = git(sourceRoot, ['worktree', 'list', '--porcelain']).split('\n').some((line) => line === `worktree ${checkout}`);
  if (!registered || git(checkout, ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'HEAD') stop('Candidate must be its registered detached worktree');
  if (git(checkout, ['rev-parse', 'HEAD']) !== receipt.revision || git(checkout, ['rev-parse', 'HEAD^{tree}']) !== receipt.tree) stop('Candidate source revision changed after preparation');
  if (git(checkout, ['rev-list', '--parents', '-n', '1', 'HEAD']) !== `${receipt.revision} ${receipt.publication.baseRevision}`) stop('Candidate must be one direct commit on the prepared publication base');
  if (git(checkout, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'])) stop('Candidate source changed after preparation');
  const artifact = path.join(checkout, 'public');
  if (receipt.artifact?.directory !== artifact || !fs.lstatSync(artifact).isDirectory() || !/^[a-f0-9]{64}$/.test(receipt.artifact.digest || '')) stop('Candidate canonical artifact is invalid');
  const digest = () => run(process.execPath, [path.join(__dirname, 'release-artifact-digest.js'), artifact], checkout);
  if (digest() !== receipt.artifact.digest) stop('Candidate artifact changed after preparation');
  run('bash', ['scripts/verify-production-release.sh', 'public'], checkout);
  if (digest() !== receipt.artifact.digest || git(checkout, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'])) stop('Candidate changed during release verification');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log('Usage: node scripts/publish-release.js <candidate.json> --approve <candidateId> [--route /] [--timeout 900] [--poll-interval 5]');
    return;
  }
  if (!args.length || args[0].startsWith('-')) stop('Select a prepared candidate receipt');
  const receiptPath = path.resolve(args.shift());
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  outcome.candidateId = receipt.candidateId || null;
  outcome.revision = receipt.revision || null;
  let approval;
  let route = '/';
  let timeout = 900;
  let interval = 5;
  while (args.length) {
    const option = args.shift();
    if (!['--approve', '--route', '--timeout', '--poll-interval'].includes(option) || !args.length) stop(`Invalid option: ${option}`);
    const value = args.shift();
    if (option === '--approve') approval = value;
    if (option === '--route') route = value;
    if (option === '--timeout') timeout = Number(value);
    if (option === '--poll-interval') interval = Number(value);
  }
  if (!receipt.candidateId || approval !== receipt.candidateId) stop('Approve this candidate explicitly with --approve <candidateId> after review');
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(interval) || interval <= 0) stop('Timeout and poll interval must be positive seconds');
  validateCandidate(receipt);
  reportPath = path.join(path.dirname(receiptPath), 'publication.json');
  logPath = path.join(path.dirname(receiptPath), 'publication.log');
  outcome.receipt = reportPath;
  const cname = fs.readFileSync(path.join(receipt.artifact.directory, 'CNAME'), 'utf8').trim();
  if (!/^[a-z0-9.-]+$/i.test(cname) || !cname.includes('.')) stop('Candidate canonical domain is invalid');
  const origin = `https://${cname}`;
  if (!route.startsWith('/') || route.startsWith('//') || /[\\\x00-\x20]/.test(route)) stop('Route must be a path on the candidate canonical HTTPS domain');
  const canonical = new URL(route, `${origin}/`);
  if (canonical.origin !== origin) stop('Route must remain on the candidate canonical HTTPS domain');
  const remoteURLs = git(receipt.sourceRepoRoot, ['remote', 'get-url', '--push', '--all', receipt.publication.remote]).split('\n');
  if (remoteURLs.length !== 1 || !remoteURLs[0] || remoteURLs[0].startsWith('-')) stop('Publication requires one unambiguous push remote');
  const remote = remoteURLs[0];
  if (remoteRevision(receipt, remote) !== receipt.publication.baseRevision) stop('Publication branch has advanced; prepare and review a fresh candidate');
  const repository = JSON.parse(run('gh', ['repo', 'view', remote, '--json', 'nameWithOwner,url'], receipt.sourceRepoRoot));
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.nameWithOwner || '')) stop('GitHub repository could not be identified');
  outcome.deploymentUrl = `${repository.url}/actions`;
  const ref = `refs/heads/${receipt.publication.branch}`;
  try {
    // The direct-parent check above proves fast-forward ancestry. The exact lease
    // rejects any concurrent remote update instead of replacing that history.
    git(receipt.checkout, ['push', `--force-with-lease=${ref}:${receipt.publication.baseRevision}`, '--', remote, `${receipt.revision}:${ref}`]);
  } catch (error) {
    if (remoteRevision(receipt, remote) !== receipt.publication.baseRevision) stop('Publication branch advanced during submission; prepare and review a fresh candidate');
    throw error;
  }
  outcome.pushed = true;
  const deadline = Date.now() + timeout * 1000;
  const environment = 'github-pages';
  const current = () => newest(api(repository.nameWithOwner, `deployments?environment=${environment}&per_page=100`, receipt.sourceRepoRoot));
  while (Date.now() < deadline) {
    if (remoteRevision(receipt, remote) !== receipt.revision) stop('Publication branch advanced after submission; inspect the current deployment');
    const runs = api(repository.nameWithOwner, `actions/workflows/hugo.yaml/runs?head_sha=${receipt.revision}&branch=${encodeURIComponent(receipt.publication.branch)}&event=push&per_page=100`, receipt.sourceRepoRoot);
    const workflow = newest((runs.workflow_runs || []).filter((entry) => entry.head_sha === receipt.revision && entry.head_branch === receipt.publication.branch && entry.event === 'push' && entry.path.split('@')[0] === '.github/workflows/hugo.yaml'));
    if (workflow) {
      outcome.workflowUrl = workflow.html_url;
      outcome.deploymentUrl = workflow.html_url;
      if (workflow.status === 'waiting' || workflow.status === 'action_required' || workflow.conclusion === 'action_required') stop('GitHub workflow requires action; inspect its approval or run details');
      if (workflow.status === 'completed' && workflow.conclusion !== 'success') stop(`GitHub workflow ${workflow.conclusion || 'failed'} for the approved revision`, 'failed');
      if (workflow.status === 'completed') {
        const deployments = api(repository.nameWithOwner, `deployments?sha=${receipt.revision}&environment=${environment}&per_page=100`, receipt.sourceRepoRoot);
        const deployment = newest(deployments.filter((entry) => entry.sha === receipt.revision && entry.environment === environment));
        if (deployment) {
          outcome.deploymentId = deployment.id;
          const status = newest(api(repository.nameWithOwner, `deployments/${deployment.id}/statuses?per_page=100`, receipt.sourceRepoRoot));
          if (status?.log_url || status?.target_url) outcome.deploymentUrl = status.log_url || status.target_url;
          if (status?.state === 'failure' || status?.state === 'error') stop(`GitHub deployment ${status.state} for the approved revision`, 'failed');
          if (status?.state === 'inactive') stop('Approved deployment is inactive; inspect the current deployment');
          if (status?.state === 'success') {
            const https = run('curl', ['--silent', '--show-error', '--location', '--max-time', '30', '--proto', '=https', '--proto-redir', '=https', '--output', '/dev/null', '--write-out', '%{http_code}\n%{url_effective}\n', '--url', canonical.href], receipt.sourceRepoRoot).split('\n');
            outcome.https = { url: canonical.href, status: /^[0-9]{3}$/.test(https[0]) ? Number(https[0]) : null, passed: false };
            if (outcome.https.status === null || outcome.https.status < 200 || outcome.https.status >= 300 || new URL(https[1]).origin !== origin) stop('Canonical HTTPS route check failed', 'failed');
            outcome.https.passed = true;
            const latest = current();
            if (latest?.sha !== receipt.revision || latest?.environment !== environment) stop('Approved revision is no longer the current deployment; inspect GitHub');
            const latestStatus = newest(api(repository.nameWithOwner, `deployments/${latest.id}/statuses?per_page=100`, receipt.sourceRepoRoot));
            if (latestStatus?.log_url || latestStatus?.target_url) outcome.deploymentUrl = latestStatus.log_url || latestStatus.target_url;
            if (latestStatus?.state === 'failure' || latestStatus?.state === 'error') stop(`Current GitHub deployment ${latestStatus.state} for the approved revision`, 'failed');
            if (latestStatus?.state !== 'success') stop('Approved revision is no longer a successful current deployment; inspect GitHub');
            if (remoteRevision(receipt, remote) !== receipt.revision) stop('Publication branch advanced after deployment; inspect GitHub');
            outcome.deployedRevision = latest.sha;
            outcome.status = 'success';
            outcome.reason = 'Approved candidate deployed; canonical HTTPS route passed';
            return;
          }
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(interval * 1000, Math.max(0, deadline - Date.now()))));
  }
  stop('Timed out confirming the approved deployment; inspect GitHub workflow and environment approvals');
}

main().catch((error) => {
  outcome.reason = error.message;
  console.error(`Release publication ${outcome.status}: ${error.message}`);
  process.exitCode = 1;
}).finally(() => {
  if (!outcome.reason) return;
  if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify({ ...outcome, checkedAt: new Date().toISOString(), log: logPath }, null, 2)}\n`);
  console.log(JSON.stringify(outcome));
});
