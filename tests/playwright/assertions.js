const { expect } = require('playwright/test');

const headingAndOverflowExpression = String.raw`(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && document.documentElement.scrollWidth <= document.documentElement.clientWidth; })()`;
const keyboardLinksExpression = String.raw`(() => Array.from(document.querySelectorAll('main a')).filter(link => link.getClientRects().length > 0).every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }))()`;
const resourcesContextExpression = String.raw`(() => { const main = document.querySelector('main'); const introduction = main?.querySelector('.editorial-index-introduction'); const experienceLinks = Array.from(introduction?.querySelectorAll('a') ?? []); const expectedIntroduction = 'This guide is for leaders, OKR champions and people building internal support for change. It helps you explain why a bounded OKR pilot may be worth testing, prepare for objections and make a smaller ask. A full OKR introduction, company-wide rollout, compensation design and underlying strategy or ownership problems need separate work. For related experience, see the Adevinta case on scaling OKR practice and Marc’s wider experience with organizational change.'; const linksAreKeyboardAccessible = experienceLinks.every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }); return main?.querySelector('h1')?.textContent.trim() === 'Resources' && main?.querySelector('.editorial-index-deck')?.textContent.trim() === 'Practical material for leaders and teams working on organizational effectiveness.' && introduction?.textContent.replace(/\s+/g, ' ').trim() === expectedIntroduction && experienceLinks.map(link => link.textContent.trim()).join('|') === 'the Adevinta case on scaling OKR practice|Marc’s wider experience with organizational change' && experienceLinks.map(link => link.getAttribute('href')).join('|') === '/work/adevinta/|/about/' && linksAreKeyboardAccessible; })()`;
const workConversationCtaExpression = String.raw`(() => { const article = document.querySelector('.work-case'); const endings = Array.from(article?.querySelectorAll(':scope > [data-conversation-cta]') ?? []); const cta = endings[0]; const actions = Array.from(cta?.querySelectorAll('a') ?? []); const allCaseLinks = Array.from(article?.querySelectorAll('a') ?? []); return endings.length === 1 && cta === article?.lastElementChild && cta?.querySelector('.eyebrow')?.textContent.trim() === 'Recognize the pattern?' && cta?.querySelector('h2')?.textContent.trim() === 'Does any of this resonate?' && cta?.querySelector('[data-conversation-copy]')?.textContent.trim() === 'Have you seen a similar pattern in your own organization—or a different version of the same challenge? Let’s compare notes.' && actions.map(link => link.textContent.replace(/\s+/g, ' ').trim()).join('|') === 'Start a conversation →|Back to all work ↖' && actions.map(link => link.getAttribute('href')).join('|') === '/contact/|/work/' && allCaseLinks.length === 2 && allCaseLinks.every((link, index) => link === actions[index]) && actions.every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }); })()`;
const writingOrientationExpression = String.raw`(() => { const main = document.querySelector('main'); const introduction = main?.querySelector('.editorial-index-introduction'); const orientationLink = introduction?.querySelector('a'); const archiveLinks = Array.from(main?.querySelectorAll('ol a') ?? []); const dates = archiveLinks.map(link => link.querySelector('time')?.getAttribute('datetime')); const expectedIntroduction = 'I write about organizational effectiveness and ways of working; alignment, governance and decision-making; and evidence-based organizational change. Start with why changing a product decision does not prove the original choice was wrong.'; orientationLink?.focus(); const focusStyle = orientationLink && getComputedStyle(orientationLink); return main?.querySelector('h1')?.textContent.trim() === 'Writing' && main?.querySelector('.editorial-index-deck')?.textContent.trim() === 'Notes on organizational effectiveness, decisions, and evidence-based change.' && introduction?.textContent.replace(/\s+/g, ' ').trim() === expectedIntroduction && orientationLink?.textContent.trim() === 'why changing a product decision does not prove the original choice was wrong' && orientationLink?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && document.activeElement === orientationLink && focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0 && archiveLinks.length === 1 && archiveLinks[0]?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && archiveLinks[0]?.querySelector('strong')?.textContent.trim() === 'Life isn’t always a river' && dates.every((date, index) => index === 0 || date <= dates[index - 1]) && main?.querySelector('[data-tags], [data-categories], [data-filters], nav[aria-label="Topics"]') === null && !main?.textContent.includes('Blog'); })()`;
const writingArticleMetadataExpression = String.raw`document.title === 'Life isn’t always a river · Marc Gelpí' && document.querySelector('meta[name="description"]')?.content === 'A changed product decision is not automatically a bad one. See how visible reasoning helps teams distinguish learning from chaos.' && document.querySelector('.writing-article-deck')?.textContent.trim() === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('meta[property="og:description"]')?.content === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('meta[name="twitter:description"]')?.content === 'Product decisions change. That doesn’t always mean they were wrong.' && document.querySelector('link[rel=canonical]')?.href === 'https://marcgelpi.com/writing/life-isnt-always-a-river/' && document.querySelector('meta[property="og:type"]')?.content === 'article' && document.querySelector('.writing-article-meta')?.textContent.includes('4 min read')`;

async function expectEvaluation(page, expression, expected = true) {
  expect(await page.evaluate(expression)).toEqual(expected);
}

async function expectEvaluationAfterLayout(page, expression, expected = true) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => undefined)),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect.poll(() => page.evaluate(expression), { timeout: 5_000 }).toEqual(expected);
}

async function expectHeadingLinksAndOverflow(page) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expectEvaluationAfterLayout(page, headingAndOverflowExpression);
    await expectEvaluation(page, keyboardLinksExpression);
  }
}

async function expectWritingArticleContent(page, expectedBodyHash = '') {
  expect(await page.evaluate(async (bodyHashExpectation) => {
    const main = document.querySelector('main');
    const body = main?.querySelector('.writing-body');
    const headings = Array.from(body?.querySelectorAll('h2') ?? []).map((heading) => heading.firstChild?.textContent.trim());
    const source = body?.querySelector('a[href="https://www.oliverburkeman.com/meditationsformortals"]');
    const normalizedBody = body?.textContent.replace(/\s+/g, ' ').trim() ?? '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedBody));
    const bodyHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const bodyIsUnchanged = bodyHashExpectation === '' || bodyHash === bodyHashExpectation;
    return main?.querySelector('h1')?.textContent.trim() === 'Life isn’t always a river'
      && main?.querySelector('.writing-article-deck')?.textContent.trim() === 'Product decisions change. That doesn’t always mean they were wrong.'
      && main?.querySelector('time')?.getAttribute('datetime') === '2026-06-01'
      && bodyIsUnchanged
      && headings[0] === 'Why it matters'
      && headings.at(-1) === 'A useful principle'
      && source?.textContent.trim() === 'Meditations for Mortals'
      && main?.querySelector('details, aside, progress, [data-comments], [data-tags], [data-categories], [data-filters], nav[aria-label="On this page"]') === null;
  }, expectedBodyHash)).toBe(true);
}

async function expectWritingArticle(page) {
  await expectWritingArticleContent(page, '050e9a0176e0a42271a81f9a9cb796056898e589531ffb95e3ad4fbb8eb89761');
  await expectEvaluation(page, writingArticleMetadataExpression);
}

async function expectReleaseMetadata(page, publicPaths, articlePaths) {
  expect(await page.evaluate(async ({ paths, articles }) => {
    const articlePathSet = new Set(articles);
    const writingPath = '/writing/life-isnt-always-a-river/';
    const articleSearchDescription = 'A changed product decision is not automatically a bad one. See how visible reasoning helps teams distinguish learning from chaos.';
    const articleSocialDescription = 'Product decisions change. That doesn’t always mean they were wrong.';
    const pageOverrides = new Map([
      ['/', { socialTitle: 'Marc Gelpí', socialDescription: 'People-first organizational effectiveness and ways of working.' }],
      ['/about/', { type: 'profile' }],
      [writingPath, { searchDescription: articleSearchDescription, socialDescription: articleSocialDescription }],
    ]);
    const pages = await Promise.all(paths.map(async (route) => {
      const response = await fetch(route);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const meta = (key) => Array.from(doc.querySelectorAll('meta')).find((node) => node.getAttribute('name') === key || node.getAttribute('property') === key)?.content;
      return {
        path: route,
        ok: response.ok,
        lang: doc.documentElement.lang,
        title: doc.title,
        description: meta('description'),
        canonical: doc.querySelector('link[rel="canonical"]')?.href,
        ogTitle: meta('og:title'),
        ogDescription: meta('og:description'),
        ogUrl: meta('og:url'),
        ogType: meta('og:type'),
        ogLocale: meta('og:locale'),
        ogImage: meta('og:image'),
        twitterCard: meta('twitter:card'),
        twitterDescription: meta('twitter:description'),
      };
    }));
    const uniqueTitles = new Set(pages.map((item) => item.title)).size === pages.length;
    const uniqueDescriptions = new Set(pages.map((item) => item.description)).size === pages.length;
    const accurate = pages.every((item) => {
      const expectations = {
        type: articlePathSet.has(item.path) ? 'article' : 'website',
        socialTitle: item.title,
        socialDescription: item.description,
        searchDescription: item.description,
        ...pageOverrides.get(item.path),
      };
      return item.ok && item.lang === 'en' && item.title
        && item.description === expectations.searchDescription
        && item.canonical === `https://marcgelpi.com${item.path}`
        && item.ogTitle === expectations.socialTitle
        && item.ogDescription === expectations.socialDescription
        && item.twitterDescription === expectations.socialDescription
        && item.ogUrl === item.canonical
        && item.ogType === expectations.type
        && item.ogLocale === 'en_GB'
        && item.ogImage?.startsWith('https://marcgelpi.com/')
        && item.twitterCard === 'summary_large_image';
    });
    return uniqueTitles && uniqueDescriptions && accurate;
  }, { paths: publicPaths, articles: articlePaths })).toBe(true);
}

module.exports = {
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
};
