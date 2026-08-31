// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';
import { sessionCard, setAgendaSelection } from './support/conference-page';

const observeScheduleFallback = (page: Parameters<typeof observeBrowserErrors>[0]) =>
  page.evaluate(() => {
    const fallbackIsVisible = () => {
      const fallback = document.querySelector('main[aria-label="Loading schedule"]');
      if (fallback !== null && fallback.getClientRects().length > 0) {
        Reflect.set(window, '__ersc_schedule_fallback_seen__', true);
      }
    };
    const observer = new MutationObserver(fallbackIsVisible);
    observer.observe(document.body, { childList: true, subtree: true });
    Reflect.set(window, '__ersc_schedule_fallback_observer__', observer);
    Reflect.set(window, '__ersc_schedule_fallback_seen__', false);
    fallbackIsVisible();
  });

const readScheduleFallbackObservation = (page: Parameters<typeof observeBrowserErrors>[0]) =>
  page.evaluate(() => {
    const observer = Reflect.get(window, '__ersc_schedule_fallback_observer__');
    if (observer instanceof MutationObserver) {
      observer.disconnect();
    }
    return Reflect.get(window, '__ersc_schedule_fallback_seen__') === true;
  });

test.describe('Server Functions', () => {
  test('refreshes through a named ServerFn without revealing the route fallback', async ({
    page,
  }) => {
    const title = 'Effect is the runtime, not a utility belt';
    const browserErrors = observeBrowserErrors(page);
    await page
      .context()
      .addCookies([
        { domain: 'localhost', name: 'conference-attendee', path: '/', value: 'Nikhil' },
      ]);
    await page.goto('/schedule/saturday');
    await expect(page.getByText('Personalized for Nikhil')).toBeVisible();
    await setAgendaSelection(page, title, false);

    try {
      let session = sessionCard(page, title);
      await observeScheduleFallback(page);
      await session.getByRole('button', { name: 'Add to the agenda' }).click();

      await expect(session.getByText("Added to Nikhil's agenda.")).toBeVisible();
      await expect(session.getByRole('button', { name: 'Remove from the agenda' })).toBeVisible();
      const agenda = page.locator('section[aria-labelledby="conference-agenda-heading"]');
      await expect(agenda).not.toContainText(title);
      await expect(agenda).toContainText(title);
      expect(await readScheduleFallbackObservation(page)).toBe(false);

      await page.reload();
      session = sessionCard(page, title);
      await expect(session.getByRole('button', { name: 'Remove from the agenda' })).toBeVisible();
      expect(browserErrors).toEqual([]);
    } finally {
      await page.goto('/schedule/saturday');
      await setAgendaSelection(page, title, false);
    }
  });

  test('submits progressively when client navigation is unavailable', async ({ page }) => {
    const title = 'A router that waits for the UI';
    const browserErrors = observeBrowserErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'navigation', { configurable: true, value: undefined });
    });
    await page.goto('/schedule/saturday');
    await setAgendaSelection(page, title, false);

    try {
      let session = sessionCard(page, title);
      await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));
      const [response] = await Promise.all([
        page.waitForResponse((candidateResponse) => {
          const request = candidateResponse.request();
          return request.isNavigationRequest() && request.method() === 'POST';
        }),
        page.waitForEvent('load'),
        session.getByRole('button', { name: 'Add to the agenda' }).click(),
      ]);

      expect(response.status()).toBe(200);
      session = sessionCard(page, title);
      await expect(session.getByRole('button', { name: 'Remove from the agenda' })).toBeVisible();
      expect(
        await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__')),
      ).toBeUndefined();
      await expect(session.getByText('Added to the agenda.')).toBeVisible();
      await expect(
        page.locator('section[aria-labelledby="conference-agenda-heading"]'),
      ).toContainText(title);
      expect(browserErrors).toEqual([]);
    } finally {
      await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible({
        timeout: 15_000,
      });
      await setAgendaSelection(page, title, false);
    }
  });
});
