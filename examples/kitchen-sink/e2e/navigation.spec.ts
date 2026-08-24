// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test, type Request } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

const isNavigationFlightRequest = (request: Request) =>
  request.method() === 'GET' && request.headers()['accept'] === 'text/x-component';

test('moves between conference days through the composed schedule', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  let navigationFlightFinished = false;
  page.on('requestfinished', (request) => {
    if (
      new URL(request.url()).pathname === '/schedule/day-two' &&
      isNavigationFlightRequest(request)
    ) {
      navigationFlightFinished = true;
    }
  });
  await page.goto('/');
  await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));
  const conferenceNavigation = page.getByRole('navigation', { name: 'Conference schedule' });
  await conferenceNavigation.evaluate((element) =>
    Reflect.set(element, '__ersc_segment_marker__', true),
  );
  const flightRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/schedule/day-two' && isNavigationFlightRequest(request),
  );
  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible();
  expect(navigationFlightFinished).toBe(false);
  await flightRequest;

  await expect(page).toHaveURL('/schedule/day-two');
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await expect(page.getByText('Mutation protocols that compose').first()).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__'))).toBe(true);
  expect(
    await conferenceNavigation.evaluate((element) =>
      Reflect.get(element, '__ersc_segment_marker__'),
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});
