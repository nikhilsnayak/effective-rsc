// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('renders and styles the conference schedule without browser errors', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const response = await page.goto('/schedule/saturday');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Converge 2026 — Conference schedule');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Conference agenda' })).toBeVisible();
  await expect(page.getByText('Server Components from first principles').first()).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('scrollbar-gutter', 'stable');

  const firstSession = page.locator('[data-slot="card"]').first();
  await expect(firstSession).toBeVisible();
  await expect(firstSession).toHaveCSS('border-top-style', 'solid');
  expect(browserErrors).toEqual([]);
});
