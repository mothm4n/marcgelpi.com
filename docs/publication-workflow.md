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

Run `npm test`. The acceptance suite builds the production site, proves approved content is reachable, and proves representative review-only content is absent from routes, listings, feeds, the sitemap, and homepage references.

For a release artifact, also run:

```sh
bash scripts/build-production.sh public
bash scripts/verify-production-release.sh public
```

Completion: every command exits successfully and the generated `public/` directory contains only approved public content.

## 5. Publish

Merge the reviewed change to `master`. GitHub Actions repeats the acceptance suite before deploying to GitHub Pages; a failed build or test blocks deployment.

Completion: the deployment succeeds and the intended canonical route resolves over HTTPS.
