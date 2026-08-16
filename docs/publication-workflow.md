# Publication workflow

Use this workflow for every editorial page, case, article, or resource. A production build is the publication gate: reviewable content may appear in a local preview, while only explicitly approved content may enter the deployed artifact.

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

Run `npm test`. The acceptance suite builds one production site, proves approved content is reachable, and proves representative review-only content is absent from routes, listings, feeds, the sitemap, and homepage references.

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
