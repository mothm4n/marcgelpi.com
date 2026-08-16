const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const {
  expectEvaluation,
  expectEvaluationAfterLayout,
  expectHeadingLinksAndOverflow,
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
  '/resources/how-to-sell-okrs/',
];
const forbiddenArtifactPattern = 'data-publication-review-banner|analytics|gtag|googletagmanager|posthog|hubspot|calendly|disqus|<form([ >])|<iframe([ >])|data-site-search|data-language-selector|cookie consent|newsletter|comments';

function publicationRecordIsApproved(yaml, record) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `${record}:`);
  if (start < 0) return false;
  const values = {};
  let inPublication = false;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (line === '  publication:') {
      inPublication = true;
      continue;
    }
    if (!inPublication) continue;
    const match = line.match(/^    ([a-z_]+):\s*["']?(.*?)["']?\s*$/);
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
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const images = Array.from(main?.querySelectorAll('img') ?? []); const headings = Array.from(main?.querySelectorAll('h2') ?? []).map(heading => heading.firstChild?.textContent.trim()); const copy = main?.textContent ?? ''; return main?.querySelector('h1')?.textContent.trim() === 'How to sell OKRs internally' && main?.querySelector('.resource-deck')?.textContent.trim() === 'A practical case for focus, alignment, accountability and ambitious learning — without selling OKRs as a cure-all.' && headings.includes('Do not sell the framework') && headings.includes('Lead with four outcomes') && headings.includes('Make a smaller ask') && ['Focus and commitment', 'Alignment and connection', 'Tracking and accountability', 'Stretch and learning'].every(outcome => copy.includes(outcome)) && images.length === 2 && images.every(image => image.alt.trim().length > 0); })()`);
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

test('SEO backlog release journey', async ({ page, canonicalArtifacts }) => {
  for (const relativePath of [
    'writing/index.html',
    'writing/life-isnt-always-a-river/index.html',
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
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const images = Array.from(main?.querySelectorAll('img') ?? []).map(image => new URL(image.src).pathname).sort(); const downloads = Array.from(main?.querySelectorAll('a[download]') ?? []).map(link => link.getAttribute('href')); return main?.querySelector('h1')?.textContent.trim() === 'How to sell OKRs internally' && main?.querySelector('.resource-deck')?.textContent.trim() === 'A practical case for focus, alignment, accountability and ambitious learning — without selling OKRs as a cure-all.' && images.join('|') === '/images/resources/okrs-focus-abstract.png|/images/resources/okrs-four-outcomes.svg' && downloads.length === 2 && downloads.every(href => href === '/downloads/how-to-sell-okrs.pdf'); })()`);
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
  await expectEvaluation(page, String.raw`(async () => { const main = document.querySelector('main'); const titles = Array.from(main?.querySelectorAll('ol a strong') ?? []).map(title => title.textContent.trim()); const response = await fetch('/writing/people-first-and-performance/'); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && titles[0] === 'Older writing fixture' && titles.includes('Life isn’t always a river') && titles.includes('Long-form writing fixture') && !main?.textContent.includes('People-first is not the opposite of performance') && response.status === 404; })()`);
  await expectEvaluation(page, String.raw`fetch('/').then(response => response.text()).then(html => html.includes('data-home-section="latest-writing"') && html.includes('/writing/life-isnt-always-a-river/') && !html.includes('/writing/people-first-and-performance/') && !html.includes('/writing/older-article/'))`);
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
