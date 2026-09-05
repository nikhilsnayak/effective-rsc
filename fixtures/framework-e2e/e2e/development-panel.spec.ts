// oxlint-disable effecttsgo/async-function, effecttsgo/global-timers -- Playwright owns this Promise-based browser-test boundary and the callback runs in the page.
import { expect, test } from '@playwright/test';

for (const missingApi of ['navigation', 'NavigationPrecommitController']) {
  test(`warns only in development when ${missingApi} is missing`, async ({ page }, testInfo) => {
    const warnings: Array<string> = [];
    page.on('console', (message) => {
      if (message.text().includes('Links use full-page navigation.')) {
        warnings.push(message.type());
      }
    });
    await page.addInitScript((api) => {
      Object.defineProperty(window, api, { configurable: true, value: undefined });
    }, missingApi);
    await page.goto('/');
    const panel = page.locator('ersc-dev-panel');
    const warning = panel.getByRole('complementary', { name: 'Development warning' });
    if (testInfo.project.name === 'dev') {
      await expect(warning).toBeVisible();
      await expect(warning).toContainText(
        missingApi === 'navigation' ? 'Navigation API' : missingApi,
      );
      await expect(warning).toContainText(
        'Client Components, Server Functions, and HMR remain enabled.',
      );
      await expect.poll(() => warnings).toEqual(['warning']);
    }

    // The notice does not require dismissal before the app can be used.
    await page.getByRole('button', { name: 'Probe count: 0' }).click();
    await expect(page.getByRole('button', { name: 'Probe count: 1' })).toBeVisible();
    if (testInfo.project.name === 'dev') {
      await expect(warning).toBeVisible();
      await panel.getByRole('button', { name: 'Dismiss development warning' }).click();
      await expect(warning).toHaveCount(0);
      await page.getByRole('button', { name: 'Probe count: 1' }).click();
      await expect(page.getByRole('button', { name: 'Probe count: 2' })).toBeVisible();
      await expect(warning).toHaveCount(0);
      expect(warnings).toHaveLength(1);
    } else {
      await expect(panel).toHaveCount(0);
      expect(warnings).toEqual([]);
    }
  });
}

test('does not warn when client navigation is supported', async ({ page }) => {
  const warnings: Array<string> = [];
  page.on('console', (message) => {
    if (message.text().includes('Links use full-page navigation.')) {
      warnings.push(message.type());
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Probe count: 0' }).click();
  await expect(page.getByRole('button', { name: 'Probe count: 1' })).toBeVisible();
  await expect(
    page.locator('ersc-dev-panel').getByRole('complementary', { name: 'Development warning' }),
  ).toHaveCount(0);
  expect(warnings).toEqual([]);
});

test('reports browser exceptions and unhandled rejections', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'dev', 'The development panel is dev-only.');
  await page.goto('/');

  await page.evaluate(() => {
    setTimeout(() => {
      throw new TypeError('Browser exception');
    }, 0);
  });

  const panel = page.locator('ersc-dev-panel');
  await expect(panel.getByRole('heading', { name: 'Runtime failures' })).toBeVisible();
  await expect(panel).toContainText('TypeError: Browser exception');
  const stackTrigger = panel.getByRole('button', { name: 'Stack trace' }).first();
  await expect(stackTrigger).toHaveAttribute('aria-expanded', 'false');
  await stackTrigger.click();
  await expect(stackTrigger).toHaveAttribute('aria-expanded', 'true');
  await panel.getByRole('button', { name: 'Close development panel' }).click();

  await page.evaluate(() => {
    setTimeout(() => {
      void Promise.reject(new Error('Unhandled rejection'));
    }, 0);
  });

  await expect(panel.getByRole('heading', { name: 'Runtime failures' })).toBeVisible();
  await expect(panel).toContainText('Unhandled rejection');
});

test('reports browser failures when client navigation is unavailable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'dev', 'The development panel is dev-only.');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { configurable: true, value: undefined });
  });
  await page.goto('/');

  await page.evaluate(() => {
    setTimeout(() => {
      throw new TypeError('Browser exception without client navigation');
    }, 0);
  });

  const panel = page.locator('ersc-dev-panel');
  await expect(panel.getByRole('heading', { name: 'Runtime failures' })).toBeVisible();
  await expect(panel).toContainText('Browser exception without client navigation');
});
