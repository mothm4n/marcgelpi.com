const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');

const previewPort = Number(process.env.SITE_PREVIEW_TEST_PORT || 4174);
const previewBaseURL = `http://127.0.0.1:${previewPort}`;
const contactActions = fs.readFileSync(path.resolve(__dirname, '../../data/contact-actions.yaml'), 'utf8');
const copyEmailIsApproved = /copy_email:[\s\S]*?status:\s*["']?approved["']?[\s\S]*?reviewed_by:\s*["']?[^\n"']+["']?[\s\S]*?reviewed_at:\s*["']?[^\n"']+["']?[\s\S]*?privacy_reviewed:\s*true/.test(contactActions);

async function expectEvaluation(page, expression, expected = true) {
  expect(await page.evaluate(expression)).toEqual(expected);
}

async function expectNoHorizontalOverflow(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => undefined)),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      { timeout: 5_000 },
    )
    .toBe(true);
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowingElements: Array.from(document.querySelectorAll('body *'))
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
  }));
  expect(widths, JSON.stringify(widths)).toEqual({
    clientWidth: widths.clientWidth,
    scrollWidth: widths.clientWidth,
    overflowingElements: [],
  });
}

test('Home journey', async ({ page }) => {
  const sectionOrder = 'hero|selected-work|how-i-work|latest-writing|selected-resources|conversation';
  await page.goto('/');
  await expectEvaluation(
    page,
    "Array.from(document.querySelectorAll('main > [data-home-section]')).map(section => section.dataset.homeSection).join('|')",
    sectionOrder,
  );

  await page.goto(`${previewBaseURL}/`);
  await expectEvaluation(page, String.raw`(() => { const hero = document.querySelector('[data-home-section="hero"]'); const actions = Array.from(hero?.querySelectorAll('a') ?? []); return hero?.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() === 'People-First Organizational Effectiveness & Ways of Working Leader' && hero?.textContent.includes('Helping organizations scale without losing the people who make them work') && actions.map(link => link.textContent.replace(/\s+/g, ' ').trim()).join('|') === 'Explore my work ↘|Start a conversation →' && actions.map(link => link.getAttribute('href')).join('|') === '/work/|/contact/'; })()`);
  await expectEvaluation(
    page,
    "Array.from(document.querySelectorAll('main > [data-home-section]')).map(section => section.dataset.homeSection).join('|')",
    sectionOrder,
  );
  await expectEvaluation(page, String.raw`(() => { const hrefs = new Set(Array.from(document.querySelectorAll('main a')).map(link => link.getAttribute('href'))); return ['/work/adevinta/', '/about/', '/writing/life-isnt-always-a-river/', '/resources/how-to-sell-okrs/', '/contact/'].every(path => hrefs.has(path)) && !hrefs.has('/writing/people-first-and-performance/') && !hrefs.has('/resources/system-diagnosis/'); })()`);
  await expectEvaluation(page, String.raw`(() => { const writing = document.querySelector('[data-home-section="latest-writing"]'); const resource = document.querySelector('[data-home-section="selected-resources"]'); return writing?.querySelector('a')?.getAttribute('href') === '/writing/life-isnt-always-a-river/' && writing?.querySelector('h2')?.textContent.trim() === 'Latest writing' && writing?.querySelector('h3')?.textContent.trim() === 'Life isn’t always a river' && writing?.textContent.includes('Product decisions change. That doesn’t always mean they were wrong.') && resource?.querySelector('a')?.getAttribute('href') === '/resources/how-to-sell-okrs/' && resource?.querySelector('h2')?.textContent.trim() === 'Selected resources' && resource?.querySelector('h3')?.textContent.trim() === 'How to sell OKRs internally' && resource?.textContent.includes('A practical case for focus, alignment, accountability and ambitious learning'); })()`);
  await expectEvaluation(page, String.raw`(() => { const work = document.querySelector('[data-home-section="selected-work"]'); const logo = work?.querySelector('img[alt="Adevinta"]'); const copy = work?.textContent.replace(/\s+/g, ' ').trim() ?? ''; return logo !== null && copy.includes('Leading global bank') && copy.includes('Fintech') && !/anonymous|anonymized|confidential/i.test(copy); })()`);
  await expectEvaluation(page, String.raw`(() => { const copy = document.querySelector('[data-home-section="how-i-work"]')?.textContent.replace(/\s+/g, ' ').toLowerCase() ?? ''; return ['grounded theory', 'interviews', 'qualitative', 'recurring patterns', 'first impressions', 'fieldwork', 'hands dirty', 'generalist'].every(term => copy.includes(term)); })()`);
  await expectEvaluation(page, String.raw`(async () => { const links = Array.from(document.querySelectorAll('main a, [data-primary-navigation] a')); return links.every(link => Boolean(link.getAttribute('href'))) && (await Promise.all(links.map(link => fetch(link.pathname).then(response => response.ok)))).every(Boolean); })()`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const hero = main?.querySelector('[data-home-section="hero"]')?.textContent.toLowerCase() ?? ''; return !hero.includes('wiris') && !/hire me|open to work|framework[- ]installer|motivational coach|ai consultant/.test(copy) && main?.querySelector('[class*="dashboard"], [class*="card-grid"]') === null; })()`);
  await expectEvaluation(page, String.raw`(() => { const picture = document.querySelector('[data-home-section="hero"] picture'); const image = picture?.querySelector('img'); const srcset = picture?.querySelector('source')?.srcset ?? ''; return image?.alt === 'Marc Gelpí smiling during a conversation' && Number(image?.getAttribute('width')) > 0 && Number(image?.getAttribute('height')) > 0 && ['480w', '800w', '1200w'].every(width => srcset.includes(width)); })()`);
  await expectEvaluation(page, String.raw`(() => { const headings = Array.from(document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')); const levels = headings.map(heading => Number(heading.tagName.slice(1))); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1); })()`);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectEvaluation(page, String.raw`(() => ['selected-work', 'how-i-work'].every(name => { const section = document.querySelector('[data-home-section="' + name + '"]'); return section && parseFloat(getComputedStyle(section).paddingTop) < 120; }))()`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectEvaluation(page, String.raw`(() => { const header = document.querySelector('.site-header'); const hero = document.querySelector('[data-home-section="hero"]'); const title = hero?.querySelector('h1'); const heroBox = hero?.getBoundingClientRect(); const titleBox = title?.getBoundingClientRect(); return header && heroBox && titleBox && heroBox.bottom < 900 && titleBox.top >= heroBox.top && titleBox.bottom <= heroBox.bottom && getComputedStyle(title).overflow !== 'hidden'; })()`);
  await expectNoHorizontalOverflow(page);
  await expectEvaluation(page, String.raw`(() => Array.from(document.querySelectorAll('[data-home-section="hero"] a')).every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }))()`);
  await expectEvaluation(page, String.raw`(() => Array.from(document.querySelectorAll('[data-home-section="latest-writing"] a, [data-home-section="selected-resources"] a')).every(link => { link.focus(); const style = getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; }))()`);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectEvaluation(page, String.raw`(() => ['latest-writing', 'selected-resources'].every(name => { const link = document.querySelector('[data-home-section="' + name + '"] .home-feature-link'); const copy = link?.querySelector('.home-feature-copy'); return link && copy && getComputedStyle(link).gridTemplateColumns.split(' ').length === 2 && copy.getBoundingClientRect().width < link.getBoundingClientRect().width; }))()`);
});

test('About journey', async ({ page }) => {
  await page.goto('/about/');
  await expectEvaluation(page, String.raw`(() => { const copy = document.querySelector('main')?.textContent.toLowerCase() ?? ''; return ['people-first', 'lateral leadership', 'evidence', 'strategy', 'product', 'technology', 'business', 'practical execution', 'coaching'].every(term => copy.includes(term)); })()`);
  await expectEvaluation(page, String.raw`(() => { const heading = document.querySelector('#principles-title'); const values = Array.from(document.querySelectorAll('[data-about-values] li')).map(item => item.textContent.trim()).join('|'); const strengths = Array.from(document.querySelectorAll('[data-about-strengths] li')); const titles = strengths.map(item => item.querySelector('h3')?.textContent.trim()).join('|'); const descriptions = strengths.map(item => item.querySelector('p')?.textContent.trim()).join('|'); return heading?.tagName === 'H2' && heading.textContent.trim() === 'Guiding how I work and create impact:' && values === 'Always people first|Transparency & trust by default|Always believe that we can do things differently|That everything you do adds value|Actions speak louder than words|Always align what I think&feel, what I say and what I do' && strengths.length === 5 && titles === 'Relator|Strategic|Analytical|Ideation|Individualization' && descriptions === 'I build trust through close, genuine relationships and do my best work when people can rely on one another.|I quickly spot relevant patterns, compare alternative paths, and choose a practical way forward.|I test assumptions against evidence, looking for causes and the factors that can change a situation.|I connect ideas that may appear unrelated and use those connections to create useful possibilities.|I notice what is distinctive in each person and shape roles and collaboration around how people do their best work.' && document.querySelector('[data-cliftonstrengths-source], .skip-link') === null; })()`);
  await expectEvaluation(page, String.raw`(() => { const section = document.querySelector('section[aria-labelledby="career-title"]'); const entries = Array.from(section?.querySelectorAll('ol > li') ?? []); const organizations = entries.map(entry => entry.querySelector('h3')?.textContent.trim()).join('|'); const earlier = section?.querySelector('[data-earlier-career]'); const linkedin = earlier?.querySelector('a[href="https://www.linkedin.com/in/gelpi/"]'); return entries.length === 6 && organizations === 'WIRIS|Independent professional|Adevinta Group|Adevinta Spain|Holaluz|NTT DATA Europe & Latam' && entries.every(entry => entry.querySelector('time[datetime]')) && ['development', 'product', 'leadership'].every(term => earlier?.textContent.toLowerCase().includes(term)) && linkedin?.textContent.includes('LinkedIn'); })()`);
  await expectEvaluation(page, String.raw`(() => { const entries = Array.from(document.querySelectorAll('section[aria-labelledby="career-title"] ol > li')); const adevintaSpain = entries.find(entry => entry.querySelector('h3')?.textContent.trim() === 'Adevinta Spain'); return adevintaSpain?.querySelector('.career-role')?.textContent.trim() === 'Business Agile Coach'; })()`);
  await expectEvaluation(page, String.raw`(() => { const entries = Array.from(document.querySelectorAll('section[aria-labelledby="career-title"] ol > li')); const current = entries[0]?.querySelector('.career-period'); const closed = entries[2]?.querySelector('.career-period'); return current?.querySelectorAll('time').length === 1 && current?.querySelector('time')?.textContent.trim() === 'September 2025' && current?.textContent.includes('Current') && closed?.querySelectorAll('time').length === 2 && Array.from(closed.querySelectorAll('time')).map(time => time.textContent.trim()).join('|') === 'January 2024|April 2025'; })()`);
  await expectEvaluation(page, String.raw`(() => { const entries = Array.from(document.querySelectorAll('section[aria-labelledby="career-title"] ol > li')); const wiris = entries.find(entry => entry.querySelector('h3')?.textContent.trim() === 'WIRIS')?.textContent.toLowerCase() ?? ''; const holaluz = entries.find(entry => entry.querySelector('h3')?.textContent.trim() === 'Holaluz'); return ['agile tech lead', 'current', 'strategy', 'product', 'engineering', 'commercial', 'okrs', 'flow', 'ownership', 'operating model', 'lateral leadership'].every(term => wiris.includes(term)) && !/%|metric|completed transformation|transformation succeeded|improved by|increased by/.test(wiris) && holaluz !== undefined && holaluz.querySelector('a') === null; })()`);
  await expectEvaluation(page, String.raw`(() => { const picture = document.querySelector('main picture'); const image = picture?.querySelector('img'); const srcset = picture?.querySelector('source')?.srcset ?? ''; return image?.alt === 'Marc Gelpí in conversation beneath the roof of a Barcelona market' && Number(image?.getAttribute('width')) > 0 && Number(image?.getAttribute('height')) > 0 && ['480w', '800w', '1200w'].every(width => srcset.includes(width)); })()`);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectEvaluation(page, String.raw`(() => { const list = document.querySelector('[data-about-values]'); const style = getComputedStyle(list); return style.gridAutoFlow === 'column' && style.gridTemplateColumns.split(' ').length === 2 && style.gridTemplateRows.split(' ').length === 3; })()`);
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEvaluation(page, String.raw`(() => { const list = document.querySelector('[data-about-values]'); const style = getComputedStyle(list); return style.gridAutoFlow === 'row' && style.gridTemplateColumns.split(' ').length === 1; })()`);
  await expectNoHorizontalOverflow(page);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); const hierarchyIsValid = headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1); const copy = main?.textContent ?? ''; return hierarchyIsValid && main?.querySelector('a[href^="tel:"], a[href$=".pdf"]') === null && !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(copy) && !/\+\d[\d .()-]{7,}/.test(copy); })()`);
});

test('Contact journey', async ({ page }) => {
  await page.goto('/contact/');
  await expectEvaluation(page, String.raw`document.querySelector('main a[href="mailto:hello@marcgelpi.com"]')?.getAttribute('aria-label')`, 'Email Marc at hello@marcgelpi.com');
  if (copyEmailIsApproved) {
    await expectEvaluation(page, "document.querySelector('[data-copy-email]')?.textContent.trim()", 'Copy email');
  } else {
    await expectEvaluation(page, "document.querySelector('[data-copy-email], [data-copy-email-status]') === null && !document.querySelector('main').textContent.includes('Copy email')");
  }
  await expectEvaluation(page, String.raw`Array.from(document.querySelectorAll('main a[href^="https://"]')).map(link => link.href).join('|')`, 'https://www.linkedin.com/in/gelpi/|https://github.com/mothm4n');
  await expectEvaluation(page, String.raw`Array.from(document.querySelectorAll('footer a[href^="https://"]')).map(link => link.href).join('|')`, 'https://www.linkedin.com/in/gelpi/|https://github.com/mothm4n');
  await expectEvaluation(page, String.raw`Array.from(document.querySelectorAll('header a')).every(link => !/linkedin\.com|github\.com/.test(link.href))`);
  await expectEvaluation(page, String.raw`(() => { const copy = document.querySelector('main')?.textContent.toLowerCase() ?? ''; return ['organizational challenge', 'speaking', 'teaching', 'professional conversation'].every(term => copy.includes(term)) && !/open to work|hire me|looking for a role|job opportunity/.test(copy); })()`);
  await expectEvaluation(page, String.raw`document.querySelector('form, iframe') === null && Array.from(document.scripts).every(script => !/analytics|gtag|googletagmanager|calendly|hubspot/i.test(script.src)) && document.cookie === ''`);
  await expectEvaluation(page, String.raw`Array.from(document.querySelectorAll('main a, footer a')).every(link => (link.getAttribute('aria-label') || link.textContent).trim().length >= 6)`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoHorizontalOverflow(page);
  await expectEvaluation(page, String.raw`(() => { const link = document.querySelector('main a[href="mailto:hello@marcgelpi.com"]'); link?.focus(); const style = link && getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; })()`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expectEvaluation(page, String.raw`(() => { const links = Array.from(document.querySelectorAll('main a[href^="https://"]')); return links.length === 2 && links.every(link => { link.focus(); return document.activeElement === link; }); })()`);
});

test('Work journey', async ({ page }) => {
  await page.goto('/work/');
  await expectEvaluation(page, String.raw`(() => { const heading = document.querySelector('main h1'); const link = document.querySelector('main a[href="/work/adevinta/"]'); const logo = link?.querySelector('img'); return heading?.textContent.trim() === 'Selected case studies' && logo?.getAttribute('alt') === 'Adevinta' && link?.getAttribute('aria-label')?.includes('Adevinta'); })()`);
  await expectEvaluation(page, String.raw`(() => { const link = document.querySelector('main a[href="/work/adevinta/"]'); link?.focus(); const style = link && getComputedStyle(link); return document.activeElement === link && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0; })()`);
  for (const viewport of [{ width: 320, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expectEvaluation(page, String.raw`(() => Array.from(document.querySelectorAll('.work-case-list a')).every(link => { const style = getComputedStyle(link); const title = link.querySelector('strong'); const label = link.firstElementChild; const titleWidth = title?.getBoundingClientRect().width ?? 0; return style.gridTemplateColumns.split(' ').length === 2 && getComputedStyle(label).gridColumnEnd === '-1' && titleWidth >= link.getBoundingClientRect().width * 0.7 && link.scrollWidth <= link.clientWidth; }))()`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectEvaluation(page, String.raw`Array.from(document.querySelectorAll('.work-case-list a')).every(link => getComputedStyle(link).gridTemplateColumns.split(' ').length === 3)`);
  await page.goto('/work/adevinta/');
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const stages = Array.from(main?.querySelectorAll('.work-case-progression section h2') ?? []).map(heading => heading.textContent.trim()).join('|'); return stages === 'Begin with one marketplace|Build a shared practice in Spain|Coordinate across Europe' && ['motors', 'eight teams', 'less than six months', 'hands-on', 'engineering managers', 'human resources business partner', 'individual and collective', 'make the way of working stick', 'peak', '20%', '60%', 'grounded theory', 'okr', 'two quarters', 'more than 1,000', 'adevinta academy', 'talent acquisition', 'time-to-hire', 'agile methodology team', 'european transformation lead', 'more than 30 agile coaches', 'local context', 'marketplaces'].every(term => copy.includes(term)) && !copy.includes('co-lead'); })()`);
  await expectEvaluation(page, String.raw`(() => { const logo = document.querySelector('img.work-case-organization-logo'); const summary = document.querySelector('.work-case-summary'); return logo?.getAttribute('alt') === 'Adevinta' && summary?.children.length === 3 && getComputedStyle(summary).gridTemplateColumns.split(' ').length === 3; })()`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; return ['collaboration', 'co-ownership', 'teams', 'managers', 'executives', 'lateral leadership'].every(term => copy.includes(term)) && !/evidence boundary|approved cv|reference evidence/.test(copy) && main?.querySelector('blockquote, a[href$=".pdf"]') === null && !copy.includes('acted alone'); })()`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const headings = Array.from(main?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? []); const levels = headings.map(heading => Number(heading.tagName.slice(1))); const summary = main?.querySelector('dl[aria-label="Case boundaries"]'); return headings.filter(heading => heading.tagName === 'H1').length === 1 && levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1) && summary?.querySelectorAll('dt').length === 3 && summary?.querySelectorAll('dd').length === 3 && Array.from(main?.querySelectorAll('section[aria-labelledby]') ?? []).every(section => document.getElementById(section.getAttribute('aria-labelledby'))); })()`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; return !/fundraising|due diligence|ipo|revenue|internal screenshot|verbatim quotation|transformation succeeded|single-handedly/.test(copy) && main?.querySelector('iframe, form, [data-internal-artifact]') === null; })()`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});

test('Protected portfolio journey', async ({ page }) => {
  await page.goto('/work/');
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const links = Array.from(main?.querySelectorAll('a') ?? []).map(link => link.getAttribute('href')); const copy = main?.textContent ?? ''; return links.includes('/work/protected-autonomy/') && links.includes('/work/preparing-to-scale/') && copy.includes('Leading global bank') && copy.includes('Fintech') && !/anonymous|anonymized|confidential/i.test(copy); })()`);
  await page.goto('/work/protected-autonomy/');
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const stages = Array.from(main?.querySelectorAll('.work-case-progression section h2') ?? []).map(heading => heading.textContent.trim()).join('|'); return stages === 'Create a protected boundary|Experiment as one product team|Describe only what was observed' && ['agile marketing', 'idea to reality', 'opportunity', 'hierarchical', 'protected island', 'autonomy', 'experimentation', 'roughly two weeks', 'under 24 hours', 'scoped pilot'].every(term => copy.includes(term)); })()`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const html = main?.innerHTML.toLowerCase() ?? ''; return ['marc’s contribution', 'collaboration', 'participants reported', 'preferred not to return'].every(term => copy.includes(term)) && !/anonymous|anonymized|confidential|paraphrased here|permission for a verbatim quotation/.test(copy) && main?.querySelector('blockquote, q, img, a[href$=".pdf"]') === null && !/imaginbank|caixabank|mckinsey|everis|ntt data/.test(html); })()`);
  await expectEvaluation(page, String.raw`(() => { const summary = document.querySelector('.work-case-summary'); return summary?.children.length === 3 && getComputedStyle(summary).gridTemplateColumns.split(' ').length === 3 && !summary?.textContent.includes('Evidence boundary'); })()`);
  await page.goto('/work/preparing-to-scale/');
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const stages = Array.from(main?.querySelectorAll('.work-case-progression section h2') ?? []).map(heading => heading.textContent.trim()).join('|'); return stages === 'Preserve what matters|Give product work a lightweight shape|Coordinate across distance' && ['values', 'culture', 'startup identity', 'lightweight product operating model', 'product discovery', 'minimum viable coordination', 'barcelona', 'argentina'].every(term => copy.includes(term)); })()`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const copy = main?.textContent.toLowerCase() ?? ''; const html = main?.innerHTML.toLowerCase() ?? ''; return ['marc’s contribution', 'collaboration', 'company leaders', 'external collaborators'].every(term => copy.includes(term)) && !/anonymous|anonymized|confidential|makes no claim about subsequent company outcomes|later result|kintai|singular solving|diana damas|\bcps\b|complex problem solving|due diligence|series a|fundraising|financing|later growth/.test(html) && main?.querySelector('blockquote, q, img, a[href$=".pdf"]') === null; })()`);
  await expectEvaluation(page, String.raw`(() => { const main = document.querySelector('main'); const sections = Array.from(main?.querySelectorAll('.work-case-progression section[aria-labelledby]') ?? []); return main?.querySelectorAll('h1').length === 1 && sections.length === 3 && sections.every(section => document.getElementById(section.getAttribute('aria-labelledby'))); })()`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});

test('Responsive quality journey', async ({ page }) => {
  const publicPaths = ['/', '/work/', '/work/adevinta/', '/work/protected-autonomy/', '/work/preparing-to-scale/', '/about/', '/contact/'];
  for (const publicPath of publicPaths) {
    await page.goto(`${previewBaseURL}${publicPath}`);
    for (const viewport of [{ width: 320, height: 800 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await expectEvaluation(page, String.raw`(() => { const overrides = document.createElement('style'); overrides.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'; document.head.append(overrides); const menu = document.querySelector('[data-mobile-navigation]'); if (menu) menu.open = true; const textIsClipped = Array.from(document.querySelectorAll('body *')).some(element => { const hasDirectText = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()); if (!hasDirectText) return false; const style = getComputedStyle(element); const clipsHorizontally = ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1; const clipsVertically = ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1; return clipsHorizontally || clipsVertically; }); const controls = Array.from(document.querySelectorAll('a, button, summary')).filter(control => { const bounds = control.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; }); const controlsRemainOperable = controls.every(control => { control.focus(); const bounds = control.getBoundingClientRect(); return document.activeElement === control && !control.matches(':disabled') && bounds.left >= -1 && bounds.right <= innerWidth + 1; }); return document.documentElement.scrollWidth <= document.documentElement.clientWidth && !textIsClipped && controlsRemainOperable; })()`);
  }
});

test('Density quality journey', async ({ page }) => {
  const densityTargets = [
    ['Home', '/', 5220],
    ['Work', '/work/', 1704],
    ['About', '/about/', 6203],
    ['Adevinta case', '/work/adevinta/', 4447],
    ['Contact', '/contact/', 2166],
  ];
  for (const [, routePath, maximumHeight] of densityTargets) {
    await page.goto(`${previewBaseURL}${routePath}`);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(maximumHeight);
  }

  const readableRoutes = [
    ['/', '.home-item-description, .home-method li p'],
    ['/about/', '.about-story p:not(:first-child), .about-strengths p, .about-career article > p:last-child'],
    ['/work/adevinta/', '.case-stage-copy p:not(.case-scope)'],
    ['/contact/', '.contact-introduction p, .contact-topics li span:last-child'],
  ];
  for (const [routePath, bodySelectors] of readableRoutes) {
    await page.goto(`${previewBaseURL}${routePath}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expectEvaluation(page, `(() => { const sample = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); return Array.from(document.querySelectorAll('${bodySelectors}')).every(element => { const style = getComputedStyle(element); context.font = style.font; const averageCharacterWidth = context.measureText(sample).width / sample.length; const charactersPerLine = element.getBoundingClientRect().width / averageCharacterWidth; const lineHeightRatio = parseFloat(style.lineHeight) / parseFloat(style.fontSize); return charactersPerLine <= 80 && lineHeightRatio >= 1.5 && lineHeightRatio <= 2; }); })()`);
  }
});

test('Isolated artifact fixture journey', async ({ page, createIsolatedArtifact }) => {
  const artifact = await createIsolatedArtifact({
    contentDirectory: path.resolve(__dirname, '../fixtures/writing'),
    environment: 'development',
  });
  await page.goto(`${artifact.url}/older-article/`);
  await expect(page.locator('main')).toContainText('ARCHIVE_ORDER_FIXTURE');
});
