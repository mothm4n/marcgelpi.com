const { expect, test } = require('playwright/test');

const mobileRouteChecks = [
  { source: '/', target: '/work/', tabs: 2 },
  { source: '/work/', target: '/about/', tabs: 3 },
  { source: '/about/', target: '/writing/', tabs: 4 },
  { source: '/writing/', target: '/resources/', tabs: 5 },
  { source: '/resources/', target: '/contact/', tabs: 6 },
  { source: '/contact/', target: '/', tabs: 1 },
];

test('English production site shell', async ({ page, request }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-primary-navigation] a')).toHaveText([
    'Home',
    'Work',
    'About',
    'Writing',
    'Resources',
    'Contact',
  ]);

  const primaryDestinations = await page
    .locator('[data-primary-navigation] a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  for (const destination of primaryDestinations) {
    expect((await request.get(destination)).ok()).toBe(true);
  }

  await expect(page.locator('[data-site-search], [data-language-selector]')).toHaveCount(0);
  for (const landmark of ['header', 'nav', 'main', 'footer']) {
    expect(await page.locator(landmark).count()).toBeGreaterThan(0);
  }

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://marcgelpi.com/',
  );
  await expect(page).toHaveTitle('Organizational Effectiveness & Ways of Working | Marc Gelpí');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Marc Gelpí helps product and technology leaders across Europe improve organizational effectiveness through people-first ways of working that scale.',
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    'People-first organizational effectiveness and ways of working.',
  );
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute(
    'content',
    'People-first organizational effectiveness and ways of working.',
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Marc Gelpí');
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', 'Marc Gelpí');

  const siteMark = page.locator('.site-mark');
  await expect(siteMark).toHaveAttribute('aria-label', 'Marc Gelpí, home');
  await expect(siteMark).toHaveText('MG');
  await expect(page.locator('.footer-mark')).toHaveText('Marc Gelpí');

  const favicon = page.locator('link[rel~="icon"]');
  await expect(favicon).toHaveAttribute('href', '/favicon.svg');
  expect((await request.get('/favicon.svg')).ok()).toBe(true);
  await expect(page.locator('[data-primary-navigation] a[aria-current="page"]')).toHaveText('Home');

  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Home');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator('[data-mobile-navigation]')).toBeVisible();

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Menu ↘');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-mobile-navigation]')).toHaveJSProperty('open', true);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Home');

  for (const viewport of [
    { width: 320, height: 800 },
    { width: 390, height: 844 },
  ]) {
    for (const route of mobileRouteChecks) {
      await page.goto(route.source);
      await page.setViewportSize(viewport);
      await page.locator('[data-mobile-navigation] summary').click();

      const linksAreTopmost = await page.locator('[data-mobile-navigation]').evaluate((menu) => {
        return (
          menu.open &&
          Array.from(menu.querySelectorAll('a')).every((link) => {
            const bounds = link.getBoundingClientRect();
            const topmost = document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            );
            return topmost === link || link.contains(topmost);
          })
        );
      });
      expect(linksAreTopmost).toBe(true);

      await page.locator(`[data-mobile-navigation] a[href="${route.target}"]`).click();
      expect(new URL(page.url()).pathname).toBe(route.target);

      await page.goto(route.source);
      await page.setViewportSize(viewport);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      for (let tabIndex = 0; tabIndex < route.tabs; tabIndex += 1) {
        await page.keyboard.press('Tab');
      }

      const focusedLink = await page.locator(':focus').evaluate((link) => {
        const style = getComputedStyle(link);
        return {
          href: link.getAttribute('href'),
          hasVisibleOutline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        };
      });
      expect(focusedLink).toEqual({ href: route.target, hasVisibleOutline: true });

      await page.keyboard.press('Enter');
      await expect.poll(() => new URL(page.url()).pathname).toBe(route.target);
    }
  }
});
