// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('moves between conference days through the composed schedule', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'See Sunday' }).click();

  await expect(page).toHaveURL('/schedule/day-two');
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await expect(page.getByText('Mutation protocols that compose').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Sunday 23 Aug/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(browserErrors).toEqual([]);
});
