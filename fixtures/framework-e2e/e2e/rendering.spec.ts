// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('renders and styles the fixture catalog without browser errors', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const response = await page.goto('/catalog/primary');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('ERSC Framework Fixture — Integration contracts');
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Fixture selection' })).toBeVisible();
  await expect(page.getByText('Document stream').first()).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', 'stable');

  const firstItem = page.locator('[data-slot="card"]').first();
  await expect(firstItem).toBeVisible();
  await expect(firstItem).toHaveCSS('border-top-style', 'solid');
  expect(browserErrors).toEqual([]);
});
