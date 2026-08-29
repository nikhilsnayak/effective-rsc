// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';
import { sessionCard, setAgendaSelection } from './support/conference-page';

test.describe.serial('Server Functions', () => {
  test('refreshes through a named ServerFn without revealing the route fallback', async ({
    page,
  }) => {
    const title = 'Effect is the runtime, not a utility belt';
    const browserErrors = observeBrowserErrors(page);
    await page.goto('/schedule/saturday');
    await setAgendaSelection(page, title, false);

    try {
      let session = sessionCard(page, title);
      const fallbackAppeared = page
        .getByRole('main', { name: 'Loading schedule' })
        .waitFor({ state: 'visible', timeout: 1_500 })
        .then(
          () => true,
          () => false,
        );
      await session.getByRole('button', { name: 'Add to the agenda' }).click();

      await expect(session.getByText('Added to the agenda.')).toBeVisible();
      await expect(session.getByRole('button', { name: 'Remove from the agenda' })).toBeVisible();
      const agenda = page.locator('section[aria-labelledby="conference-agenda-heading"]');
      await expect(agenda).not.toContainText(title);
      expect(await fallbackAppeared).toBe(false);
      await expect(agenda).toContainText(title);

      await page.reload();
      session = sessionCard(page, title);
      await expect(session.getByRole('button', { name: 'Remove from the agenda' })).toBeVisible();
      expect(browserErrors).toEqual([]);
    } finally {
      await page.goto('/schedule/saturday');
      await setAgendaSelection(page, title, false);
    }
  });

  test('returns a complete document when submitted before hydration', async ({ page }) => {
    const title = 'A router that waits for the UI';
    await page.goto('/schedule/saturday');
    await setAgendaSelection(page, title, false);
    await page.route('**/_ersc/assets/main.js', (route) => route.abort());

    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      let session = sessionCard(page, title);
      const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
      await session.getByRole('button', { name: 'Add to the agenda' }).click();
      const response = await navigation;

      expect(response?.status()).toBe(200);
      session = sessionCard(page, title);
      await expect(session.getByRole('button', { name: 'Remove from the agenda' })).toBeVisible();
      await expect(session.getByText('Added to the agenda.')).toBeVisible();
      await expect(
        page.locator('section[aria-labelledby="conference-agenda-heading"]'),
      ).toContainText(title);
    } finally {
      await page.unroute('**/_ersc/assets/main.js');
      await page.goto('/schedule/saturday');
      await setAgendaSelection(page, title, false);
    }
  });
});
