// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

test('moves between conference days through the composed schedule', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/');
  await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));
  const conferenceNavigation = page.getByRole('navigation', { name: 'Conference schedule' });
  await conferenceNavigation.evaluate((element) =>
    Reflect.set(element, '__ersc_segment_marker__', true),
  );
  await page.evaluate(() => {
    const loadingLabels = new Set<string>();
    const recordVisibleLoadingBoundaries = () => {
      for (const element of document.querySelectorAll<HTMLElement>(
        '[aria-busy="true"][aria-label]',
      )) {
        if (element.checkVisibility()) {
          const label = element.getAttribute('aria-label');
          if (label !== null) {
            loadingLabels.add(label);
          }
        }
      }
    };
    const observer = new MutationObserver(recordVisibleLoadingBoundaries);
    observer.observe(document.body, { childList: true, subtree: true });
    Reflect.set(window, '__ersc_loading_observation__', { loadingLabels, observer });
  });
  const flightRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/schedule/day-two' &&
      request.headers()['accept'] === 'text/x-component',
  );
  await page.getByRole('link', { name: 'See Sunday' }).click();
  await flightRequest;

  await expect(page).toHaveURL('/schedule/day-two');
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await expect(page.getByText('Mutation protocols that compose').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Sunday 23 Aug/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__'))).toBe(true);
  expect(
    await conferenceNavigation.evaluate((element) =>
      Reflect.get(element, '__ersc_segment_marker__'),
    ),
  ).toBe(true);
  const observedLoadingLabels = await page.evaluate(() => {
    const observation = Reflect.get(window, '__ersc_loading_observation__') as {
      readonly loadingLabels: Set<string>;
      readonly observer: MutationObserver;
    };
    observation.observer.disconnect();
    return [...observation.loadingLabels];
  });
  expect(observedLoadingLabels).not.toContain('Loading conference navigation');
  expect(observedLoadingLabels).not.toContain('Loading personal agenda');
  expect(browserErrors).toEqual([]);
});
