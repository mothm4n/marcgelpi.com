# Publication workflow

Use this workflow for every editorial page, case, article, or resource. A production build is the publication gate: reviewable content may appear in a local preview, while only explicitly approved content may enter the deployed artifact.

For changes to publication automation or scheduling, preserve the [approval requirements](#3-record-approval) and [production verification procedure](#4-verify-the-production-boundary). For performance changes, consult the [publication performance budget, measurements, and decisions](../.github/publication-performance.md).

## 1. Prepare reviewable content

Create the content with `draft: true` and this publication record:

```yaml
publication:
  status: "review"
  reviewed_by: ""
  reviewed_at: ""
  privacy_reviewed: false
```

Write claims from source material. Keep private contact details and internal artifacts out of repository content and test fixtures.

For a case study, start from `archetypes/case.md`. Classify every claim as `public-fact`, `recollection`, or `inference`, and record its source or review note. Complete the attribution, naming-permission, collaboration, and identifiability checks before approval.

Completion: the page is reviewable locally and contains no unclassified claim or private source detail.

## 2. Preview without publishing

Run a Hugo development preview with drafts enabled. Review the page's copy, evidence boundaries, privacy, responsive layout, keyboard path, headings, links, and image alternatives.

Completion: Marc has reviewed the rendered page, not only its source file, and every requested change is incorporated.

## 3. Record approval

Set `draft: false`, change `publication.status` to `approved`, and record the real reviewer, review date, and `privacy_reviewed: true`.

For case studies, also record:

- `attribution_reviewed: true`
- `collaboration_reviewed: true`
- `identifiability_reviewed: true`
- `naming_permission: "named-approved"` or `"anonymized"`
- at least one classified claim with its source or review note

About must set `career_history_complete: true`; in this project that flag means the approved **selected career history** is complete for the intended public scope.

Completion: all required approval fields contain real review decisions; no placeholder value remains.

## 4. Verify the production boundary

Run `npm test`. The acceptance suite builds one production site, proves approved content is reachable, and proves representative review-only content is absent from routes, listings, feeds, the sitemap, and homepage references. For concise local results with a retained complete log, use the [agent test command](agents/test-running.md).

For a release artifact, build it once, point the complete acceptance suite at that exact directory, and then verify the unchanged directory:

```sh
bash scripts/build-production.sh public
PLAYWRIGHT_PRODUCTION_ARTIFACT="$PWD/public" npm test
bash scripts/verify-production-release.sh public
```

Completion: every command exits successfully and the tested `public/` directory contains only approved public content. Do not rebuild between acceptance, verification, and upload.

## 5. Publish

Merge the reviewed change to `master`. GitHub Actions builds the canonical production artifact once, runs the acceptance and release gates against it, and submits that same artifact to GitHub Pages. A failed build, test, privacy gate, or release check blocks upload and deployment.

Completion: the deployment succeeds and the intended canonical route resolves over HTTPS.

## 6. Schedule an approved article

Complete the preview and approval steps before scheduling. Keep `draft: false` and the real approval record, then set `date` and `publishDate` to the intended publication time. For example:

```yaml
date: 2026-11-10T09:00:00+01:00
publishDate: 2026-11-10T09:00:00+01:00
draft: false
```

The date shown on the article comes from `date`; `publishDate` controls when it becomes eligible for a production build. Setting both to the same time keeps the archive and homepage ordered by publication time. If `publishDate` is omitted, Hugo uses `date`. The site uses `Europe/Madrid` for dates without an explicit offset. Use `+01:00` in winter and `+02:00` in summer when specifying an offset.

Merge the approved article into `master` ahead of that time. Hugo excludes future articles from production pages, listings, feeds, and the sitemap. To review a future draft locally, run `hugo server --buildDrafts --buildFuture`; do not enable future content in production.

The existing GitHub Actions workflow rebuilds and deploys at minute 17 of every hour, with the same acceptance, approval, and release gates as a normal publication. An eligible article appears after the next successful deployment. No new commit is needed on its publication day. Push and manual publication triggers remain available.

This is an hourly schedule, not an exact-time guarantee: GitHub may delay or drop a scheduled run, and the deployment also takes time. GitHub also disables schedules in public repositories after 60 days without repository activity; re-enable the workflow in Actions if necessary. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [Hugo's future-content rules](https://gohugo.io/getting-started/usage/#draft-future-and-expired-content).

Completion: the article is absent before its publication time and appears in the next successful production deployment after that time, with its approval record intact.
