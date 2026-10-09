const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const {
  expectEvaluation,
  expectEvaluationAfterLayout,
  expectHeadingLinksAndOverflow,
  expectLatestWriting,
  expectReleaseMetadata,
  expectWritingArticle,
  expectWritingArticleContent,
  headingAndOverflowExpression,
  resourcesContextExpression,
  workConversationCtaExpression,
  writingOrientationExpression,
} = require('./assertions');

const repoRoot = path.resolve(__dirname, '../..');
const previewPort = Number(process.env.SITE_PREVIEW_TEST_PORT || 4174);
const previewBaseURL = `http://127.0.0.1:${previewPort}`;
const publicPaths = [
  '/',
  '/work/',
  '/work/adevinta/',
  '/work/protected-autonomy/',
  '/work/preparing-to-scale/',
  '/about/',
  '/writing/',
  '/writing/life-isnt-always-a-river/',
  '/writing/when-work-is-ready/',
  '/resources/',
  '/resources/how-to-sell-okrs/',
  '/contact/',
  '/404.html',
];
const hiddenPaths = ['/authors/', '/categories/', '/series/', '/tags/'];
const articlePaths = [
  '/work/adevinta/',
  '/work/protected-autonomy/',
  '/work/preparing-to-scale/',
  '/writing/life-isnt-always-a-river/',
  '/writing/when-work-is-ready/',
  '/resources/how-to-sell-okrs/',
];
const forbiddenArtifactPattern = 'data-publication-review-banner|analytics|gtag|googletagmanager|posthog|hubspot|calendly|disqus|<form([ >])|<iframe([ >])|data-site-search|data-language-selector|cookie consent|newsletter|comments';

function publicationRecordIsApproved(yaml, record) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `${record}:`);
  if (start < 0) return false;
  const values = {};
  let inPublication = record === 'publication';
  const valuePattern = record === 'publication'
    ? /^  ([a-z_]+):\s*["']?(.*?)["']?\s*$/
    : /^    ([a-z_]+):\s*["']?(.*?)["']?\s*$/;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (line === '  publication:') {
      inPublication = true;
      continue;
    }
    if (!inPublication) continue;
    const match = line.match(valuePattern);
    if (match) values[match[1]] = match[2];
  }
  return values.status === 'approved'
    && Boolean(values.reviewed_by)
    && Boolean(values.reviewed_at)
    && values.privacy_reviewed === 'true';
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function directoryContains(directory, text) {
  if (!(await exists(directory))) return false;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await directoryContains(entryPath, text)) return true;
    } else if ((await fs.readFile(entryPath)).includes(Buffer.from(text))) {
      return true;
    }
  }
  return false;
}

async function expectAxeClean(page) {
  await page.addScriptTag({ path: path.join(repoRoot, 'node_modules/axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
      },
    });
    return results.violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact))
      .map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
}

test('Contact copy review journey', async ({ page, canonicalArtifacts }) => {
  const contactActions = await fs.readFile(path.join(repoRoot, 'data/contact-actions.yaml'), 'utf8');
  await page.goto('/contact/');
  if (publicationRecordIsApproved(contactActions, 'copy_email')) {
    await expect(page.locator('main')).toContainText('Copy email');
  } else {
    await expectEvaluation(page, String.raw`document.querySelector('[data-copy-email], [data-copy-email-status]') === null && !document.querySelector('main').textContent.includes('Copy email')`);
    for (const reviewOnlyCopy of ['Copy email', 'Email copied', 'Copy unavailable']) {
      expect(await directoryContains(canonicalArtifacts.productionDirectory, reviewOnlyCopy)).toBe(false);
    }
  }

  await page.goto(`${previewBaseURL}/contact/`);
  await expectEvaluation(page, String.raw`(() => { const address = document.querySelector('[data-contact-email-address]'); const button = document.querySelector('[data-copy-email]'); const status = document.querySelector('[data-copy-email-status]'); button?.focus(); const style = button && getComputedStyle(button); return address?.textContent.trim() === 'hello@marcgelpi.com' && getComputedStyle(address).userSelect !== 'none' && button?.type === 'button' && button.textContent.trim() === 'Copy email' && document.activeElement === button && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && status?.getAttribute('role') === 'status' && status?.getAttribute('aria-live') === 'polite'; })()`);
  await expectEvaluation(page, String.raw`(async () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedEmail = value; } } }); const button = document.querySelector('[data-copy-email]'); button.focus(); button.click(); await new Promise(resolve => setTimeout(resolve, 0)); return window.__copiedEmail === 'hello@marcgelpi.com' && document.querySelector('[data-copy-email-status]')?.textContent.trim() === 'Email copied' && document.activeElement === button; })()`);
  await expectEvaluation(page, String.raw`(async () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); const button = document.querySelector('[data-copy-email]'); button.focus(); button.click(); await new Promise(resolve => setTimeout(resolve, 0)); return document.querySelector('[data-copy-email-status]')?.textContent.trim() === 'Copy unavailable. Select and copy hello@marcgelpi.com manually.' && document.querySelector('[data-contact-email-address]')?.textContent.trim() === 'hello@marcgelpi.com' && document.activeElement === button; })()`);
});

test('Conversation CTA review journey', async ({ page }) => {
  const conversationData = await fs.readFile(path.join(repoRoot, 'data/conversation-ctas.yaml'), 'utf8');
  await page.goto('/about/');
  expect((await page.locator('body').textContent()).includes('A shared question?'))
    .toBe(publicationRecordIsApproved(conversationData, 'about'));
  for (const casePath of ['/work/adevinta/', '/work/protected-autonomy/', '/work/preparing-to-scale/']) {
    await page.goto(casePath);
    expect((await page.locator('body').textContent()).includes('Recognize the pattern?'))
      .toBe(publicationRecordIsApproved(conversationData, 'work'));
  }

  await page.goto(`${previewBaseURL}/about/`);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expectEvaluationAfterLayout(page, String.raw`(() => { const article = document.querySelector('.about-shell'); const career = article?.querySelector('.about-career'); const cta = article?.querySelector(':scope > [data-conversation-cta]'); const action = cta?.querySelector('a'); return cta === article?.lastElementChild && career?.nextElementSibling === cta && cta?.querySelector('.eyebrow')?.textContent.trim() === 'A shared question?' && cta?.querySelector('h2')?.textContent.trim() === 'Let’s compare notes.' && cta?.querySelector('[data-conversation-copy]')?.textContent.trim() === 'If something in this story connects with a challenge you’re working through, I’d be glad to hear from you.' && action?.textContent.replace(/\s+/g, ' ').trim() === 'Start a conversation →' && action?.getAttribute('href') === '/contact/' && career?.querySelector('a[href="https://www.linkedin.com/in/gelpi/"]') !== null && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()`);
  }
  for (const casePath of ['/work/adevinta/', '/work/protected-autonomy/', '/work/preparing-to-scale/']) {
    await page.goto(`${previewBaseURL}${casePath}`);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await expectEvaluation(page, workConversationCtaExpression);
    }
  }
});

test('Publication workflow journey', async ({
  page,
  createContentFixture,
  createIsolatedArtifact,
  expectProductionRejection,
}) => {
  test.setTimeout(120_000);
  const invalid = await createContentFixture();
  await invalid.copyFixture('publication/approved-case.md', 'work/approved-case.md');
  await invalid.copyFixture('publication/invalid-public-case.md', 'work/invalid-public-case.md');
  const invalidResult = await expectProductionRejection({
    contentDirectory: invalid.directory,
    expectedError: 'cannot be published',
    seedFiles: { 'index.html': 'PREVIOUS_PUBLICATION_SENTINEL\n' },
  });
  expect(await fs.readFile(path.join(invalidResult.directory, 'index.html'), 'utf8')).toBe('PREVIOUS_PUBLICATION_SENTINEL\n');

  const invalidSection = await createContentFixture();
  await invalidSection.copyFixture('publication/invalid-section.md', 'work/_index.md');
  await expectProductionRejection({ contentDirectory: invalidSection.directory, expectedError: 'cannot be published' });

  const unreviewedPrivate = await createContentFixture();
  await unreviewedPrivate.copyFixture('publication/unreviewed-private-contact-page.md', 'unreviewed-private-contact.md');
  const privateResult = await expectProductionRejection({
    contentDirectory: unreviewedPrivate.directory,
    expectedError: 'requires publication.privacy_reviewed: true',
  });
  expect(await directoryContains(privateResult.directory, 'private-source@example.invalid')).toBe(false);

  const incompleteAbout = await createContentFixture();
  await incompleteAbout.copyFixture('publication/incomplete-about.md', 'about/index.md');
  await expectProductionRejection({
    contentDirectory: incompleteAbout.directory,
    expectedError: 'requires career_history_complete: true',
  });

  const invalidGeneral = await createContentFixture();
  await invalidGeneral.copyFixture('publication/invalid-public-page.md', 'unapproved-page.md');
  await expectProductionRejection({ contentDirectory: invalidGeneral.directory, expectedError: 'cannot be published' });

  const invalidClaim = await createContentFixture();
  await invalidClaim.copyFixture('publication/invalid-claim-case.md', 'work/invalid-claim-case.md');
  await expectProductionRejection({ contentDirectory: invalidClaim.directory, expectedError: 'unsupported basis' });

  const incomplete = await createContentFixture();
  await incomplete.copyFixture('publication/incomplete-approved-case.md', 'work/incomplete-approved-case.md');
  await expectProductionRejection({
    contentDirectory: incomplete.directory,
    expectedError: 'requires publication.reviewed_by',
  });

  const approved = await createContentFixture();
  await approved.copyFixture('publication/approved-case.md', 'work/approved-case.md');
  await approved.copyFixture('publication/review-case.md', 'work/review-case.md');
  const production = await createIsolatedArtifact({ contentDirectory: approved.directory });
  await page.goto(`${production.url}/work/approved-case/`);
  await expect(page.locator('h1')).toHaveText('Approved case fixture');
  await expectEvaluation(page, String.raw`!document.body.textContent.includes('SOURCE_REGISTER_ONLY_SENTINEL')`);
  await expectEvaluation(page, String.raw`fetch('/work/review-case/').then(response => response.status === 404)`);
  await expectEvaluation(page, String.raw`(async () => { const paths = ['/', '/work/', '/work/index.xml', '/sitemap.xml']; const pages = await Promise.all(paths.map(route => fetch(route).then(response => response.text()))); return pages.every(content => !content.includes('review-case') && !content.includes('REVIEW_ONLY_SOURCE_SENTINEL')); })()`);

  const preview = await createIsolatedArtifact({
    contentDirectory: approved.directory,
    environment: 'development',
  });
  await page.goto(`${preview.url}/work/review-case/`);
  await expect(page.locator('body')).toContainText('REVIEW_ONLY_SOURCE_SENTINEL');
  await expect(page.locator('[data-publication-review-banner]')).toHaveCount(0);
});

test('Scheduled publication journey', async ({
  page,
  createContentFixture,
  createIsolatedArtifact,
  expectProductionRejection,
}) => {
  test.setTimeout(120_000);
  const fixture = await createContentFixture();
  await fixture.copyFixture('writing/scheduled-article.md', 'writing/scheduled-article.md');
  const scheduled = await fs.readFile(path.join(fixture.directory, 'writing/scheduled-article.md'), 'utf8');
  const reviewFile = path.join(fixture.directory, 'writing/scheduled-review.md');
  await fs.writeFile(reviewFile, scheduled
    .replace('Scheduled writing fixture', 'Scheduled review fixture')
    .replace('draft: false', 'draft: true')
    .replace('status: "approved"', 'status: "review"')
    .replace('SCHEDULED_WRITING_SENTINEL', 'SCHEDULED_REVIEW_SENTINEL'));

  // In June, 09:00 in Europe/Madrid is 07:00 UTC.
  const before = await createIsolatedArtifact({
    contentDirectory: fixture.directory,
    clock: '2030-06-01T06:59:59Z',
  });
  for (const route of ['/writing/scheduled-article/', '/writing/scheduled-review/']) {
    expect((await page.request.get(`${before.url}${route}`)).status()).toBe(404);
  }
  for (const marker of ['scheduled-article', 'scheduled-review', 'SCHEDULED_WRITING_SENTINEL', 'SCHEDULED_REVIEW_SENTINEL']) {
    expect(await directoryContains(before.directory, marker)).toBe(false);
  }
  await page.goto(`${before.url}/writing/`);
  await expectEvaluation(page, writingOrientationExpression);
  await expectLatestWriting(page);

  const after = await createIsolatedArtifact({
    contentDirectory: fixture.directory,
    clock: '2030-06-01T07:00:00Z',
  });
  await page.goto(`${after.url}/writing/scheduled-article/`);
  await expect(page.locator('main h1')).toHaveText('Scheduled writing fixture');
  await expect(page.locator('main time')).toHaveAttribute('datetime', '2030-06-01');
  await page.goto(`${after.url}/writing/`);
  await expectEvaluation(page, writingOrientationExpression);
  await expect(page.locator('.writing-archive a').first()).toHaveAttribute('href', '/writing/scheduled-article/');
  await expectLatestWriting(page);
  await page.goto(`${after.url}/`);
  await expect(page.locator('[data-home-section="latest-writing"] a')).toHaveAttribute('href', '/writing/scheduled-article/');
  for (const route of ['/writing/index.xml', '/index.xml', '/sitemap.xml']) {
    const response = await page.request.get(`${after.url}${route}`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('https://marcgelpi.com/writing/scheduled-article/');
  }
  expect((await page.request.get(`${after.url}/writing/scheduled-review/`)).status()).toBe(404);
  expect(await directoryContains(after.directory, 'scheduled-review')).toBe(false);
  expect(await directoryContains(after.directory, 'SCHEDULED_REVIEW_SENTINEL')).toBe(false);
  const verification = childProcess.spawnSync(
    'bash',
    [path.join(repoRoot, 'scripts/verify-production-release.sh'), after.directory],
    { encoding: 'utf8' },
  );
  expect(verification.status, `${verification.stdout}\n${verification.stderr}`).toBe(0);

  // Reaching the date cannot bypass approval even if draft is cleared.
  await fs.writeFile(reviewFile, (await fs.readFile(reviewFile, 'utf8')).replace('draft: true', 'draft: false'));
  await expectProductionRejection({
    contentDirectory: fixture.directory,
    clock: '2030-06-01T07:00:00Z',
    expectedError: 'cannot be published',
  });
});

test('Release readiness journey', async ({ page, canonicalArtifacts }) => {
  test.setTimeout(120_000);
  const verification = childProcess.spawnSync(
    'bash',
    [path.join(repoRoot, 'scripts/verify-production-release.sh'), canonicalArtifacts.productionDirectory],
    { encoding: 'utf8' },
  );
  expect(verification.status, `${verification.stdout}\n${verification.stderr}`).toBe(0);

  await page.goto('/');
  await expectReleaseMetadata(page, publicPaths, articlePaths);
  await expectEvaluation(page, `(async () => { const hiddenPaths = ${JSON.stringify(hiddenPaths)}; const [robots, sitemap, cname, feed] = await Promise.all(['/robots.txt', '/sitemap.xml', '/CNAME', '/index.xml'].map(route => fetch(route).then(response => response.ok ? response.text() : ''))); const hiddenContentAbsent = content => hiddenPaths.every(route => !content.includes(route)); return robots.includes('User-agent: *') && robots.includes('Sitemap: https://marcgelpi.com/sitemap.xml') && sitemap.includes('<loc>https://marcgelpi.com/') && hiddenContentAbsent(sitemap) && cname.trim() === 'marcgelpi.com' && feed.includes('<rss') && feed.includes('<channel>') && feed.includes('https://marcgelpi.com/') && hiddenContentAbsent(feed); })()`);
  await expectEvaluation(page, `Promise.all(${JSON.stringify(hiddenPaths)}.map(route => fetch(route))).then(responses => responses.every(response => response.status === 404))`);
  await expectEvaluation(page, `(async () => { const html = (await Promise.all(${JSON.stringify(publicPaths)}.map(route => fetch(route).then(response => response.text())))).join(' '); return !(new RegExp(${JSON.stringify(forbiddenArtifactPattern)}, 'i')).test(html); })()`);

  await page.goto('/404.html');
  await expectEvaluation(page, String.raw`document.querySelector('main h1')?.textContent.trim() === 'This page is not here.' && Array.from(document.querySelectorAll('main a')).some(link => link.getAttribute('href') === '/' && link.textContent.includes('Back to home'))`);

  for (const publicPath of publicPaths) {
    await page.goto(publicPath);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expectEvaluationAfterLayout(page, String.raw`(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return document.querySelector('header, nav, main, footer') && headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && Array.from(document.images).every(image => image.hasAttribute('alt')) && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()`);
    await expectAxeClean(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectEvaluationAfterLayout(page, String.raw`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
    await expectAxeClean(page);
  }
});

test('Resources journey', async ({
  page,
  canonicalArtifacts,
  createContentFixture,
  createIsolatedArtifact,
}) => {
  const archetype = await fs.readFile(path.join(repoRoot, 'archetypes/resources.md'), 'utf8');
  expect(archetype).toContain('draft: true');
  expect(archetype).toContain('status: "review"');
  expect(archetype).toContain('privacy_reviewed: false');

  for (const relativePath of [
    'resources/index.html',
    'resources/how-to-sell-okrs/index.html',
    'downloads/how-to-sell-okrs.pdf',
  ]) {
    expect(await exists(path.join(canonicalArtifacts.productionDirectory, relativePath))).toBe(true);
  }
  expect(await exists(path.join(canonicalArtifacts.productionDirectory, 'resources/system-diagnosis/index.html'))).toBe(false);

  await page.goto('/resources/');
  await expectEvaluation(page, String.raw`(async () => { const main = document.querySelector('main'); const links = Array.from(main?.querySelectorAll('ol a') ?? []); const retired = await fetch('/resources/system-diagnosis/'); return main?.querySelector('h1')?.textContent.trim() === 'Resources' && links.length === 1 && links[0]?.getAttribute('href') === '/resources/how-to-sell-okrs/' && links[0]?.querySelector('strong')?.textContent.trim() === 'How to sell OKRs internally' && !main?.textContent.includes('The 15-minute system diagnosis') && !/coming soon|sign up|subscribe|newsletter|fake download/i.test(main?.textContent ?? '') && retired.status === 404; })()`);
  await expectEvaluation(page, resourcesContextExpression);
  await expectEvaluation(page, headingAndOverflowExpression);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEvaluation(page, headingAndOverflowExpression);
  await page.goto('/resources/how-to-sell-okrs/');
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const images = Array.from(main?.querySelectorAll('img') ?? []); const headings = Array.from(main?.querySelectorAll('h2') ?? []).map(heading => heading.firstChild?.textContent.trim()); const copy = main?.textContent ?? ''; return main?.querySelector('h1')?.textContent.trim() === 'How to sell OKRs internally' && main?.querySelector('.resource-deck')?.textContent.trim() === 'Prepare a first OKR cycle your manager can approve, with a worked example and a proposal you can copy.' && headings.includes('Start with a problem your manager can see') && headings.includes('Explain what OKRs mean') && headings.includes('Ask for one OKR cycle') && ['Choose fewer priorities', 'Give teams one shared direction', 'Review results while there is time to act', 'Test a more ambitious result'].every(outcome => copy.includes(outcome)) && images.length === 2 && images.every(image => image.alt.trim().length > 0); })()`);
  await expectEvaluation(page, String.raw`(async () => { const links = Array.from(document.querySelectorAll('main a[download][href="/downloads/how-to-sell-okrs.pdf"]')); const response = await fetch('/downloads/how-to-sell-okrs.pdf'); const bytes = new Uint8Array(await response.arrayBuffer()); const signature = String.fromCharCode(...bytes.slice(0, 5)); const structure = new TextDecoder('latin1').decode(bytes); return links.length === 2 && links[0]?.textContent.includes('Download the field guide') && response.ok && response.headers.get('content-type') === 'application/pdf' && signature === '%PDF-' && structure.includes('/StructTreeRoot') && /\/Marked\s+true/.test(structure) && structure.includes('/Lang(en-US)'); })()`);

  const fixture = await createContentFixture();
  await fixture.copyFixture('resources/review-resource.md', 'resources/review-resource.md');
  const fixtureProduction = await createIsolatedArtifact({ contentDirectory: fixture.directory });
  for (const relativePath of [
    'resources/index.html',
    'resources/how-to-sell-okrs/index.html',
    'downloads/how-to-sell-okrs.pdf',
  ]) {
    expect(await exists(path.join(fixtureProduction.directory, relativePath))).toBe(true);
  }
  for (const relativePath of [
    'resources/system-diagnosis/index.html',
    'resources/review-resource/index.html',
    'downloads/review-only.pdf',
    'images/resources/review-only.jpg',
  ]) {
    expect(await exists(path.join(fixtureProduction.directory, relativePath))).toBe(false);
  }
  const fixturePreview = await createIsolatedArtifact({
    contentDirectory: fixture.directory,
    environment: 'development',
  });
  await page.goto(`${fixturePreview.url}/resources/`);
  await expectEvaluation(page, String.raw`(async () => { const main = document.querySelector('main'); const titles = Array.from(main?.querySelectorAll('ol a strong') ?? []).map(title => title.textContent.trim()); const retired = await fetch('/resources/system-diagnosis/'); return titles.includes('How to sell OKRs internally') && titles.includes('Review-only resource fixture') && !main?.textContent.includes('The 15-minute system diagnosis') && retired.status === 404; })()`);
  await page.goto(`${fixturePreview.url}/resources/review-resource/`);
  await expectEvaluation(page, String.raw`(async () => { const link = document.querySelector('main a[download][href="/downloads/review-only.pdf"]'); const download = await fetch('/downloads/review-only.pdf'); const image = document.querySelector('main img[src="/images/resources/review-only.jpg"]'); const imageResponse = await fetch('/images/resources/review-only.jpg'); return document.querySelector('main h1')?.textContent.trim() === 'Review-only resource fixture' && link !== null && download.ok && image !== null && imageResponse.ok; })()`);
  await expectEvaluation(page, String.raw`fetch('/').then(response => response.text()).then(html => html.includes('data-home-section="selected-resources"') && html.includes('/resources/how-to-sell-okrs/') && !html.includes('/resources/system-diagnosis/') && !html.includes('/resources/review-resource/'))`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); const copy = main?.textContent ?? ''; return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && !/coming soon|sign up|subscribe|newsletter|fake download/i.test(copy) && main?.querySelector('form, input, textarea, iframe') === null; })()`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectEvaluation(page, headingAndOverflowExpression);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEvaluation(page, headingAndOverflowExpression);
});

test('OKR pilot proposal review journey', async ({ page, canonicalArtifacts, createContentFixture, createIsolatedArtifact }) => {
  const exampleHeading = 'Example: a three-month OKR cycle for two teams';
  const briefHeading = 'Copy this test proposal';
  const revisionPath = 'resources/how-to-sell-okrs/review.md';
  const revision = await fs.readFile(path.join(repoRoot, 'content', revisionPath), 'utf8');
  const approved = /^draft: false$/m.test(revision) && publicationRecordIsApproved(revision, 'publication');
  const publishedPDF = await fs.readFile(path.join(repoRoot, 'assets/downloads/how-to-sell-okrs.pdf'));
  const reviewPDF = await fs.readFile(path.join(repoRoot, 'assets/downloads/how-to-sell-okrs-review.pdf'));
  const fieldGuidePath = 'resources/how-to-sell-okrs/field-guide.md';
  const fieldGuide = await fs.readFile(path.join(repoRoot, 'content', fieldGuidePath), 'utf8');
  const fieldGuideApproved = /^draft: false$/m.test(fieldGuide) && publicationRecordIsApproved(fieldGuide, 'publication');
  const fieldGuidePDF = await fs.readFile(path.join(repoRoot, 'assets/downloads/how-to-sell-okrs-field-guide-review.pdf'));
  const expectDownloadEdition = async (expectedPDF) => {
    const downloads = page.locator('main a[download]');
    await expect(downloads).toHaveCount(2);
    for (const download of await downloads.all()) {
      await expect(download).toHaveAttribute('href', '/downloads/how-to-sell-okrs.pdf');
      const url = new URL(await download.getAttribute('href'), page.url()).href;
      const response = await page.request.get(url);
      expect(response.ok()).toBe(true);
      expect((await response.body()).equals(expectedPDF)).toBe(true);
    }
    const hiddenAsset = await page.request.get(new URL('/downloads/how-to-sell-okrs-review.pdf', page.url()).href);
    expect(hiddenAsset.status()).toBe(404);
    const hiddenFieldGuide = await page.request.get(new URL('/downloads/how-to-sell-okrs-field-guide-review.pdf', page.url()).href);
    expect(hiddenFieldGuide.status()).toBe(404);
  };
  expect(reviewPDF.equals(publishedPDF)).toBe(false);
  expect(reviewPDF.toString('latin1')).toContain('/StructTreeRoot');
  expect(reviewPDF.toString('latin1')).toMatch(/\/Marked\s+true/);

  await page.goto('/resources/how-to-sell-okrs/');
  await expectDownloadEdition(fieldGuideApproved ? fieldGuidePDF : approved ? reviewPDF : publishedPDF);
  await expect(page.getByRole('heading', { name: exampleHeading })).toHaveCount(approved ? 1 : 0);
  await expect(page.getByRole('heading', { name: briefHeading })).toHaveCount(approved ? 1 : 0);
  expect(await directoryContains(canonicalArtifacts.productionDirectory, exampleHeading)).toBe(approved);
  expect(await directoryContains(canonicalArtifacts.productionDirectory, 'Ana, product lead')).toBe(approved);
  expect(await directoryContains(canonicalArtifacts.productionDirectory, 'OKR means Objectives and Key Results.')).toBe(approved);

  await page.goto(`${previewBaseURL}/resources/how-to-sell-okrs/`);
  const example = page.getByRole('region', { name: exampleHeading });
  const brief = page.getByRole('region', { name: briefHeading });
  await expect(example).toBeVisible();
  await expect(example).toContainText('fictional example');
  await expect(example).toContainText('Ana, product lead');
  await expect(page.getByRole('heading', { name: 'Explain what OKRs mean' })).toBeVisible();
  await expect(example).toContainText('4 of 20');
  await expect(example).toContainText('10%');
  await expect(example).toContainText('1 January to 31 March 2027');
  await expect(example).toContainText('29 January');
  await expect(example).toContainText('1 April');
  await expect(example).toContainText('Count each customer once');
  await expect(example).toContainText('Do not report a 0% delay rate');
  await expect(example).toContainText('even if the teams miss the target');
  await expect(page.locator('.resource-article-body')).not.toContainText(/six[- ]week|customer onboarding/i);
  await expectDownloadEdition(fieldGuidePDF);
  await expect(page.locator('[data-field-guide-review-banner]')).toHaveCount(fieldGuideApproved ? 0 : 1);

  const exampleFields = await example.locator('dt').allTextContents();
  const briefFields = await brief.locator('strong').allTextContents();
  expect(exampleFields).toHaveLength(10);
  expect(briefFields).toEqual(exampleFields);
  expect(exampleFields[8]).toBe('When we will continue, adapt or stop');
  await expect(example.locator('dd')).toHaveCount(10);
  await expect(brief.locator('form, input, textarea')).toHaveCount(0);
  await expect(brief).toContainText('[');
  await expect(page.getByRole('heading', { name: 'Check whether a test makes sense' })).toBeVisible();
  await expect(page.locator('.resource-article-body a[href="/work/adevinta/"]')).toHaveCount(1);
  await expect(page.locator('.resource-article-body a[href="/contact/"]')).toHaveCount(1);

  await expectEvaluation(page, String.raw`(() => { const headings = Array.from(document.querySelectorAll('main h2')).map(heading => heading.innerText.trim()); const order = ['Start with a problem your manager can see', 'Explain what OKRs mean', 'Check whether a test makes sense', 'Ask for one OKR cycle', 'Example: a three-month OKR cycle for two teams', 'Explain how the work could improve', 'Answer your manager’s questions', 'Copy this test proposal', 'Experience and further reading', 'Bring the organizational problem'].map(heading => headings.indexOf(heading)); return order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1])); })()`);
  await expectEvaluation(page, String.raw`(() => { const brief = document.querySelector('[aria-labelledby="okr-pilot-brief-title"]'); const range = document.createRange(); range.selectNodeContents(brief); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); const selected = selection.toString(); selection.removeAllRanges(); return getComputedStyle(brief).userSelect !== 'none' && selected.includes('The problem') && selected.includes('Permission we need') && selected.includes('['); })()`);

  await page.locator('.resource-article-body img').scrollIntoViewIfNeeded();
  for (const viewport of [{ width: 390, height: 844 }, { width: 860, height: 900 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expectEvaluationAfterLayout(page, headingAndOverflowExpression);
    await expectAxeClean(page);
  }

  const fixture = await createContentFixture();
  const fixtureRevision = path.join(fixture.directory, revisionPath);
  const fixtureFieldGuide = path.join(fixture.directory, fieldGuidePath);
  const pendingFieldGuide = fieldGuide
    .replace(/^draft:.*$/m, 'draft: true')
    .replace(/^  status:.*$/m, '  status: "review"')
    .replace(/^  reviewed_by:.*$/m, '  reviewed_by: ""')
    .replace(/^  reviewed_at:.*$/m, '  reviewed_at: ""')
    .replace(/^  privacy_reviewed:.*$/m, '  privacy_reviewed: false');
  await fs.writeFile(fixtureFieldGuide, pendingFieldGuide);
  const pendingRevision = revision
    .replace(/^draft:.*$/m, 'draft: true')
    .replace(/^  status:.*$/m, '  status: "review"')
    .replace(/^  reviewed_by:.*$/m, '  reviewed_by: ""')
    .replace(/^  reviewed_at:.*$/m, '  reviewed_at: ""')
    .replace(/^  privacy_reviewed:.*$/m, '  privacy_reviewed: false');
  await fs.writeFile(fixtureRevision, pendingRevision);
  const pendingArtifact = await createIsolatedArtifact({ contentDirectory: fixture.directory });
  await page.goto(`${pendingArtifact.url}/resources/how-to-sell-okrs/`);
  await expect(page.getByRole('heading', { name: 'Do not sell the framework' })).toBeVisible();
  await expectDownloadEdition(publishedPDF);

  const incompleteApproval = pendingRevision.replace('draft: true', 'draft: false').replace('status: "review"', 'status: "approved"');
  await fs.writeFile(fixtureRevision, incompleteApproval);
  const unapprovedArtifact = await createIsolatedArtifact({ contentDirectory: fixture.directory });
  expect(await directoryContains(unapprovedArtifact.directory, 'OKR means Objectives and Key Results.')).toBe(false);
  await page.goto(`${unapprovedArtifact.url}/resources/how-to-sell-okrs/`);
  await expect(page.getByRole('heading', { name: 'Do not sell the framework' })).toBeVisible();
  await expectDownloadEdition(publishedPDF);

  await fs.writeFile(fixtureRevision, incompleteApproval
    .replace('reviewed_by: ""', 'reviewed_by: "Local acceptance fixture"')
    .replace('reviewed_at: ""', 'reviewed_at: "2026-10-09"')
    .replace('privacy_reviewed: false', 'privacy_reviewed: true'));
  const approvedArtifact = await createIsolatedArtifact({ contentDirectory: fixture.directory });
  await page.goto(`${approvedArtifact.url}/resources/how-to-sell-okrs/`);
  await expect(page.getByRole('heading', { name: 'Explain what OKRs mean' })).toBeVisible();
  await expect(page.getByRole('region', { name: exampleHeading })).toBeVisible();
  await expect(page.locator('[data-publication-review-banner]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to sell OKRs internally');
  await expectDownloadEdition(reviewPDF);
  await expect(page.locator('[data-field-guide-review-banner]')).toHaveCount(0);

  const incompleteFieldGuide = pendingFieldGuide
    .replace('draft: true', 'draft: false')
    .replace('status: "review"', 'status: "approved"');
  await fs.writeFile(fixtureFieldGuide, incompleteFieldGuide);
  const incompleteFieldGuideArtifact = await createIsolatedArtifact({ contentDirectory: fixture.directory });
  await page.goto(`${incompleteFieldGuideArtifact.url}/resources/how-to-sell-okrs/`);
  await expectDownloadEdition(reviewPDF);
  await expect(page.getByRole('heading', { name: exampleHeading })).toHaveCount(1);

  const approvedFieldGuide = incompleteFieldGuide
    .replace('reviewed_by: ""', 'reviewed_by: "Editorial review fixture"')
    .replace('reviewed_at: ""', 'reviewed_at: "2026-10-09"')
    .replace('privacy_reviewed: false', 'privacy_reviewed: true');
  await fs.writeFile(fixtureFieldGuide, approvedFieldGuide);
  const approvedFieldGuideArtifact = await createIsolatedArtifact({ contentDirectory: fixture.directory });
  await page.goto(`${approvedFieldGuideArtifact.url}/resources/how-to-sell-okrs/`);
  await expectDownloadEdition(fieldGuidePDF);
  await expect(page.locator('[data-publication-review-banner]')).toHaveCount(0);
  const hiddenFieldGuidePage = await page.request.get(new URL('/resources/how-to-sell-okrs/field-guide/', page.url()).href);
  expect(hiddenFieldGuidePage.status()).toBe(404);
});

test('SEO backlog release journey', async ({ page, canonicalArtifacts }) => {
  for (const relativePath of [
    'writing/index.html',
    'writing/life-isnt-always-a-river/index.html',
    'writing/when-work-is-ready/index.html',
    'resources/index.html',
    'resources/how-to-sell-okrs/index.html',
    'downloads/how-to-sell-okrs.pdf',
    'images/resources/okrs-focus-abstract.png',
    'images/resources/okrs-four-outcomes.svg',
  ]) {
    expect(await exists(path.join(canonicalArtifacts.productionDirectory, relativePath))).toBe(true);
  }
  const verification = childProcess.spawnSync(
    'bash',
    [path.join(repoRoot, 'scripts/verify-production-release.sh'), canonicalArtifacts.productionDirectory],
    { encoding: 'utf8' },
  );
  expect(verification.status, `${verification.stdout}\n${verification.stderr}`).toBe(0);

  await page.goto('/writing/');
  await expectReleaseMetadata(page, publicPaths, articlePaths);
  const unpublishedPaths = [
    ...hiddenPaths,
    '/writing/people-first-and-performance/',
    '/resources/system-diagnosis/',
    '/resources/review-resource/',
    '/downloads/review-only.pdf',
    '/images/resources/review-only.jpg',
  ];
  await expectEvaluation(page, `Promise.all(${JSON.stringify(unpublishedPaths)}.map(route => fetch(route))).then(responses => responses.every(response => response.status === 404))`);
  await expectEvaluation(page, writingOrientationExpression);
  await expectHeadingLinksAndOverflow(page);
  await page.goto('/writing/life-isnt-always-a-river/');
  await expectWritingArticle(page);
  await expectHeadingLinksAndOverflow(page);
  await page.goto('/resources/');
  await expectEvaluation(page, resourcesContextExpression);
  await expectEvaluation(page, String.raw`(() => { const links = Array.from(document.querySelectorAll('main ol a')); return links.length === 1 && links[0]?.getAttribute('href') === '/resources/how-to-sell-okrs/' && links[0]?.querySelector('strong')?.textContent.trim() === 'How to sell OKRs internally' && links[0]?.textContent.includes('Field guide · PDF'); })()`);
  await expectHeadingLinksAndOverflow(page);
  await page.goto('/resources/how-to-sell-okrs/');
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const images = Array.from(main?.querySelectorAll('img') ?? []).map(image => new URL(image.src).pathname).sort(); const downloads = Array.from(main?.querySelectorAll('a[download]') ?? []).map(link => link.getAttribute('href')); return main?.querySelector('h1')?.textContent.trim() === 'How to sell OKRs internally' && main?.querySelector('.resource-deck')?.textContent.trim() === 'Prepare a first OKR cycle your manager can approve, with a worked example and a proposal you can copy.' && images.join('|') === '/images/resources/okrs-focus-abstract.png|/images/resources/okrs-four-outcomes.svg' && downloads.length === 2 && downloads.every(href => href === '/downloads/how-to-sell-okrs.pdf'); })()`);
  for (const casePath of ['/work/adevinta/', '/work/protected-autonomy/', '/work/preparing-to-scale/']) {
    await page.goto(casePath);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expectEvaluation(page, workConversationCtaExpression);
      await expectEvaluation(page, headingAndOverflowExpression);
    }
  }
});

test('Writing journey', async ({ page, canonicalArtifacts, createContentFixture, createIsolatedArtifact }) => {
  const archetype = await fs.readFile(path.join(repoRoot, 'archetypes/writing.md'), 'utf8');
  expect(archetype).toContain('status: "review"');
  expect(archetype).toContain('privacy_reviewed: false');
  expect(archetype).not.toContain('<!--more-->');
  for (const relativePath of [
    'writing/index.html',
    'writing/life-isnt-always-a-river/index.html',
    'writing/when-work-is-ready/index.html',
    'writing/index.xml',
  ]) {
    expect(await exists(path.join(canonicalArtifacts.productionDirectory, relativePath))).toBe(true);
  }
  expect(await exists(path.join(canonicalArtifacts.productionDirectory, 'writing/people-first-and-performance/index.html'))).toBe(false);

  await page.goto('/writing/');
  await expectEvaluation(page, writingOrientationExpression);
  await expectEvaluation(page, headingAndOverflowExpression);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEvaluation(page, headingAndOverflowExpression);
  await page.goto('/writing/life-isnt-always-a-river/');
  await expectWritingArticle(page);
  await expectEvaluation(page, String.raw`fetch('/writing/index.xml').then(response => response.text()).then(feed => feed.includes('<rss') && feed.includes('<title>Life isn’t always a river</title>') && feed.includes('https://marcgelpi.com/writing/life-isnt-always-a-river/'))`);

  await page.goto('/writing/when-work-is-ready/');
  await expect(page.locator('main h1')).toHaveText('AI changes the rhythm of work');
  await expect(page.locator('main time')).toHaveAttribute('datetime', '2026-10-08');
  await expect(page.locator('.writing-body')).toContainText('event-driven ways of working');
  await expect(page.locator('.writing-body a[href^="https://"]')).toHaveCount(5);
  await expect(page.locator('main details, main nav[aria-label="On this page"], [data-publication-review-banner]')).toHaveCount(0);
  await expectHeadingLinksAndOverflow(page);
  await expectEvaluation(page, String.raw`fetch('/writing/index.xml').then(response => response.text()).then(feed => feed.includes('<title>AI changes the rhythm of work</title>') && feed.includes('https://marcgelpi.com/writing/when-work-is-ready/'))`);

  const fixture = await createContentFixture();
  await fixture.copyFixture('writing/older-article.md', 'writing/older-article.md');
  await fixture.copyFixture('writing/long-article.md', 'writing/long-article.md');
  await fixture.copyFixture('writing/long-no-headings.md', 'writing/long-no-headings.md');
  await fixture.append(
    'writing/long-article.md',
    `${'This deliberately long fixture adds enough independent words to cross the editorial threshold and exercise the conditional navigation behavior.\n'.repeat(130)}`,
  );
  await fixture.append(
    'writing/long-no-headings.md',
    `${'This deliberately long fixture adds enough independent words to cross the editorial threshold while retaining a single unbroken section.\n'.repeat(130)}`,
  );
  const preview = await createIsolatedArtifact({
    contentDirectory: fixture.directory,
    environment: 'development',
  });
  await page.goto(`${preview.url}/writing/`);
  await expectLatestWriting(page, `http://127.0.0.1:${Number(process.env.SITE_TEST_PORT || 4173)}`);
  await expectEvaluation(page, String.raw`(async () => { const main = document.querySelector('main'); const titles = Array.from(main?.querySelectorAll('ol a strong') ?? []).map(title => title.textContent.trim()); const response = await fetch('/writing/people-first-and-performance/'); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && titles.includes('AI changes the rhythm of work') && titles.includes('Older writing fixture') && titles.includes('Life isn’t always a river') && titles.includes('Long-form writing fixture') && !main?.textContent.includes('People-first is not the opposite of performance') && response.status === 404; })()`);
  await expectEvaluation(page, String.raw`fetch('/').then(response => response.text()).then(html => html.includes('data-home-section="latest-writing"') && !html.includes('/writing/people-first-and-performance/') && !html.includes('/writing/older-article/'))`);
  await expectEvaluation(page, headingAndOverflowExpression);
  await page.goto(`${preview.url}/writing/older-article/`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); return main?.querySelector('h1')?.textContent.trim() === 'Older writing fixture' && main?.querySelector('article nav[aria-label="On this page"], article aside, progress, [data-comments], [data-tags], [data-categories], [data-filters]') === null; })()`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEvaluation(page, String.raw`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
  await page.goto(`${preview.url}/writing/life-isnt-always-a-river/`);
  await expectWritingArticleContent(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEvaluation(page, String.raw`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
  await page.goto(`${preview.url}/writing/long-article/`);
  await expectEvaluation(page, String.raw`(() => { const tocLink = document.querySelector('main nav[aria-label="On this page"] a[href="#long-argument"]'); const depth = document.querySelector('main details > summary'); return tocLink?.textContent.trim() === 'Long argument' && depth?.textContent.trim() === 'Go deeper'; })()`);
  await page.goto(`${preview.url}/writing/long-no-headings/`);
  await expectEvaluation(page, String.raw`document.querySelector('main nav[aria-label="On this page"]') === null`);
});
