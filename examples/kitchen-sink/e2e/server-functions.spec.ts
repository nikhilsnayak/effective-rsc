// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';
import { sessionCard, setAgendaSelection } from './support/conference-page';

test.describe.serial('Server Functions', () => {
  test('calls a named ServerFn.make reference imported by a Client Component', async ({ page }) => {
    const title = 'Effect is the runtime, not a utility belt';
    const browserErrors = observeBrowserErrors(page);
    await page.goto('/schedule/saturday');
    await setAgendaSelection(page, title, false);

    try {
      let session = sessionCard(page, title);
      await session.getByRole('button', { name: 'Add to your agenda' }).click();

      await expect(session.getByRole('button', { name: 'Remove from your agenda' })).toBeVisible();
      await expect(session.getByText('Added to your agenda.')).toBeVisible();
      await expect(
        page.locator('section[aria-labelledby="personal-agenda-heading"]'),
      ).toContainText(title);

      await page.reload();
      session = sessionCard(page, title);
      await expect(session.getByRole('button', { name: 'Remove from your agenda' })).toBeVisible();
      expect(browserErrors).toEqual([]);
    } finally {
      await page.goto('/schedule/saturday');
      await setAgendaSelection(page, title, false);
    }
  });

  // The mutation executes, but the full-document response does not complete yet.
  // Keep the intended contract executable while the Working checkpoint remains unresolved.
  test.fixme('returns a complete document when submitted before hydration', async ({ page }) => {
    const title = 'A router that waits for the UI';
    await page.goto('/schedule/saturday');
    await setAgendaSelection(page, title, false);
    await page.route('**/_ersc/assets/main.js', (route) => route.abort());

    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      let session = sessionCard(page, title);
      const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
      await session.getByRole('button', { name: 'Add to your agenda' }).click();
      const response = await navigation;

      expect(response?.status()).toBe(200);
      session = sessionCard(page, title);
      await expect(session.getByRole('button', { name: 'Remove from your agenda' })).toBeVisible();
      await expect(session.getByText('Added to your agenda.')).toBeVisible();
      await expect(
        page.locator('section[aria-labelledby="personal-agenda-heading"]'),
      ).toContainText(title);
    } finally {
      await page.unroute('**/_ersc/assets/main.js');
      await page.goto('/schedule/saturday');
      await setAgendaSelection(page, title, false);
    }
  });
});
