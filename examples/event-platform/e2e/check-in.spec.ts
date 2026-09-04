// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('checks in a credential and reverses the operation', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);

  await page.goto('/organizer/check-in/event-effect-systems-summit-2026');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Effect Systems Summit check-in' }),
  ).toBeVisible();
  await expect(
    page.getByText('Arrived', { exact: true }).locator('..').getByText('0', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Ticket code').fill('GTH-DEMOADA0001');
  await page.getByRole('button', { name: 'Check in' }).click();

  await expect(page.getByText('Ada Lovelace is checked in.')).toBeVisible();
  await expect(
    page.getByText('Arrived', { exact: true }).locator('..').getByText('1', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo check-in' })).toBeVisible();
  await expect(page.getByText('Checked in by Nikhil Nayak')).toBeVisible();
  await page.getByRole('button', { name: 'Undo check-in' }).click();

  await expect(page.getByText("Ada Lovelace's check-in was undone.")).toBeVisible();
  await expect(
    page.getByText('Arrived', { exact: true }).locator('..').getByText('0', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Reopened by Nikhil Nayak')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo check-in' })).toHaveCount(0);

  expect(browserErrors).toEqual([]);
});
