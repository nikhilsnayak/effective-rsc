// oxlint-disable effecttsgo/async-function, effecttsgo/global-timers -- Playwright owns this Promise-based browser-test boundary and the callback runs in the page.
import { expect, test } from '@playwright/test';

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
  await panel.getByRole('button', { name: 'Close development panel' }).click();

  await page.evaluate(() => {
    setTimeout(() => {
      void Promise.reject(new Error('Unhandled rejection'));
    }, 0);
  });

  await expect(panel.getByRole('heading', { name: 'Runtime failures' })).toBeVisible();
  await expect(panel).toContainText('Unhandled rejection');
});
