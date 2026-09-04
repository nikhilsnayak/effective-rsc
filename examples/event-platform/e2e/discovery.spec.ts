// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('discovers an event and opens its published programme', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);

  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Events worth showing up for.' }),
  ).toBeVisible();
  await expect(page.getByText('Effect Systems Summit', { exact: true })).toBeVisible();

  await page.locator('a[href="/events/runtime-collective/effect-systems-summit-2026"]').click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit' }),
  ).toBeVisible();
  await expect(page.getByText('De Hallen Studios')).toBeVisible();

  await page.getByRole('link', { name: 'View programme' }).click();
  await expect(page).toHaveURL('/events/runtime-collective/effect-systems-summit-2026/programme');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit programme' }),
  ).toBeVisible();
  await expect(page.getByText('Effects as an operating model', { exact: true })).toBeVisible();

  expect(browserErrors).toEqual([]);
});
