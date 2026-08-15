import { expect, test, type Page } from '@playwright/test';

const CANONICAL_ORIGIN = 'https://squad.leo-land.ru';
const CANONICAL_AUTOSEED = `${CANONICAL_ORIGIN}/autoseed`;

const cases = [
  ['обычный вход', './', CANONICAL_AUTOSEED],
  [
    'топы с фильтрами',
    './#leaderboards?period=week&role=commander&unsafe=discard',
    `${CANONICAL_ORIGIN}/#leaderboards?period=week&role=commander&unsafe=discard`
  ],
  [
    'журнал с выбранной сессией',
    './#journal?server=squadjs2&session=s1_0123456789abcdef01234567&tab=revives',
    `${CANONICAL_ORIGIN}/#journal?server=squadjs2&session=s1_0123456789abcdef01234567&tab=revives`
  ],
  ['баланс', './#balance', `${CANONICAL_ORIGIN}/#balance`],
  [
    'победители с сервером',
    './#winners?server=squadjs2',
    `${CANONICAL_ORIGIN}/#winners?server=squadjs2`
  ],
  ['неизвестный фрагмент', './#private?target=https://example.test', CANONICAL_AUTOSEED],
  ['неподдерживаемые параметры баланса', './#balance?unsafe=discard', CANONICAL_AUTOSEED]
] as const;

async function interceptCanonicalSite(page: Page) {
  await page.route(`${CANONICAL_ORIGIN}/**`, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>Единый сайт BSS</title><main>Единый сайт BSS</main>'
    })
  );
}

for (const [name, source, target] of cases) {
  test(`${name} получает фиксированное каноническое назначение`, async ({ page }) => {
    await interceptCanonicalSite(page);
    await page.goto(source, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(target);
    expect(page.url()).toBe(target);
  });
}

test('без JavaScript остаётся доступная ссылка на основной AutoSeed', async ({ browser }, testInfo) => {
  const configuredBaseURL = testInfo.project.use.baseURL;
  if (typeof configuredBaseURL !== 'string') throw new Error('Playwright baseURL is required.');

  const context = await browser.newContext({
    baseURL: configuredBaseURL,
    javaScriptEnabled: false
  });

  for (const width of [320, 390, 768, 1440]) {
    await test.step(`${width}px`, async () => {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#journal?server=squadjs2', { waitUntil: 'domcontentloaded' });

      await expect(page.locator('[data-autoseed-cutover]')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'AutoSeed переехал' })).toBeVisible();
      const fallback = page.getByRole('link', { name: 'Открыть AutoSeed на основном сайте' });
      await expect(fallback).toHaveAttribute('href', CANONICAL_AUTOSEED);
      await page.keyboard.press('Tab');
      await expect(fallback).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.close();
    });
  }

  await context.close();
});
