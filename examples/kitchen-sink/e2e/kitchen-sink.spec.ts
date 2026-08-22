// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test, type Page } from '@playwright/test';

const observeBrowserErrors = (page: Page) => {
  const errors: Array<string> = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  return errors;
};

test('renders and styles the conference schedule without browser errors', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Converge 2026 — Conference schedule');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Your agenda' })).toBeVisible();
  await expect(page.getByText('Server Components from first principles').first()).toBeVisible();

  const firstSession = page.locator('[data-slot="card"]').first();
  await expect(firstSession).toBeVisible();
  await expect(firstSession).toHaveCSS('border-top-style', 'solid');
  expect(browserErrors).toEqual([]);
});

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
