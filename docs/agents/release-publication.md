# Publish a prepared candidate

Prepare the selected changes using [the publication workflow](../publication-workflow.md#prepare-selected-local-changes). Review the prepared checkout, production artifact, and local `candidate.json` receipt. Editorial approval and privacy review remain required for every public page.

After approving that exact candidate, use its ID from the preparation result:

```sh
npm run --silent release:publish -- /tmp/site-release-review/candidate.json \
  --approve <candidateId> --route /intended/canonical/route/
```

The command requires Git, GitHub CLI authentication for the publication repository, and curl. It accepts only a `ready` candidate with passing build, complete acceptance, release, artifact, and source checks. It rejects a changed candidate commit, source checkout, or canonical artifact, and rechecks the release boundary without rebuilding.

Publication uses the remote and branch recorded during preparation. The prepared commit must be one direct commit after the recorded branch revision. The command checks the actual push destination, then submits only if the branch still has that revision. A concurrent branch update also rejects submission and preserves that update. Prepare and review a fresh candidate when the branch has advanced. GitHub branch protection and environment approvals still apply.

The existing GitHub workflow runs its production gates and deploys its canonical artifact. The command waits for that workflow and a successful `github-pages` deployment at the approved revision. It checks the supplied route on the candidate's canonical HTTPS domain, then confirms the latest deployment status and branch revision again. `--route` defaults to `/`; it must remain a path on that domain. `--timeout` defaults to 900 seconds and `--poll-interval` to 5 seconds.

One JSON result reports `success`, `failed`, or `action_required`, the candidate and requested revision, whether submission occurred, and the GitHub deployment link when available. Success also includes the confirmed deployed revision and HTTPS result. Other outcomes exit unsuccessfully and explain the failure or required action. A queued workflow, environment approval, or timeout may need attention through the reported GitHub link; the command never grants an environment approval. After submission, use that link to inspect or retry the same workflow rather than submitting a different revision.

The candidate directory retains `publication.json` and the detailed `publication.log`. Keep these local alongside the preparation receipt and logs. A local preparation artifact is retained as review evidence; GitHub builds and checks its own single canonical artifact from the same approved revision.

The original checkout keeps its selected local edits after publication. Before preparing another candidate, refresh its publication tracking branch and synchronize the checkout while preserving unrelated work. Follow the [publication workflow](../publication-workflow.md) for the next review; the publisher does not reset, merge, or clean that checkout.

When changing either delivery command, run `npm run test:release-preparation`, `npm run test:release-publication`, and `npm test`. The publisher regression suite freshly prepares one candidate with the real production and complete acceptance gates, then exercises the complete publisher against a temporary local Git remote and external GitHub/HTTPS fixtures. It runs separately from the production test path.
