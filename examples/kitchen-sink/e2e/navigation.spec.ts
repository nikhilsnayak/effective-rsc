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
      new URL(request.url()).pathname === '/schedule/sunday' &&
      isNavigationFlightRequest(request)
    ) {
      navigationFlightFinished = true;
    }
  });
  await page.goto('/schedule/saturday');
  await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));
  const conferenceNavigation = page.getByRole('navigation', { name: 'Conference schedule' });
  await conferenceNavigation.evaluate((element) =>
    Reflect.set(element, '__ersc_segment_marker__', true),
  );
  const flightRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/schedule/sunday' && isNavigationFlightRequest(request),
  );
  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  // The destination page deliberately takes two seconds. Loading must commit from the streamed
  // route shell rather than appearing only after the page row has resolved.
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page).toHaveURL('/schedule/sunday');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeHidden();
  expect(navigationFlightFinished).toBe(false);
  await flightRequest;

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

test('reuses completed route trees for back and forward navigation', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const flightRequests: Array<string> = [];
  page.on('request', (request) => {
    if (isNavigationFlightRequest(request)) {
      flightRequests.push(new URL(request.url()).pathname);
    }
  });

  await page.goto('/schedule/saturday');
  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);

  await page.evaluate(() => window.navigation.back().finished);
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();

  await page.evaluate(() => window.navigation.forward().finished);
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();

  expect(flightRequests).toEqual(['/schedule/sunday']);
  expect(browserErrors).toEqual([]);
});

test('aborts a committed streaming navigation when it is superseded', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const sundayFlightOutcome = Promise.withResolvers<'failed' | 'finished'>();
  const isSundayFlight = (request: Request) =>
    new URL(request.url()).pathname === '/schedule/sunday' && isNavigationFlightRequest(request);
  page.on('requestfailed', (request) => {
    if (isSundayFlight(request)) {
      sundayFlightOutcome.resolve('failed');
    }
  });
  page.on('requestfinished', (request) => {
    if (isSundayFlight(request)) {
      sundayFlightOutcome.resolve('finished');
    }
  });

  await page.goto('/schedule/saturday');
  await page.evaluate(() => {
    Reflect.get(window, 'navigation').addEventListener('navigate', (event: Event) => {
      const destination = Reflect.get(Reflect.get(event, 'destination'), 'url');
      if (new URL(destination).pathname === '/schedule/sunday') {
        Reflect.get(event, 'signal').addEventListener(
          'abort',
          () => {
            Reflect.set(window, '__ersc_sunday_navigation_aborted__', true);
          },
          { once: true },
        );
      }
    });
  });
  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page).toHaveURL('/schedule/sunday');
  expect(await page.evaluate(() => Boolean(Reflect.get(window, 'navigation').transition))).toBe(
    true,
  );

  // Keep the superseding Flight pending long enough for an abandoned decoder error to destroy
  // the committed fallback if transport cancellation leaks into React.
  await page.route(
    (url) => url.pathname === '/',
    // oxlint-disable-next-line effecttsgo/async-function -- Playwright owns this Promise boundary.
    async (route, request) => {
      if (isNavigationFlightRequest(request)) {
        await page.waitForTimeout(1_000);
      }
      await route.continue();
    },
  );

  await page.evaluate(() => {
    const observeRollback = () => {
      const saturdayHeading = [...document.querySelectorAll('h1')].find(
        (heading) => heading.textContent === 'Saturday schedule',
      );
      if (saturdayHeading !== undefined && saturdayHeading.getClientRects().length > 0) {
        Reflect.set(window, '__ersc_supersession_rolled_back__', true);
      }
    };
    new MutationObserver(observeRollback).observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Converge home' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Converge' })).toBeVisible();
  expect(await sundayFlightOutcome.promise).toBe('failed');
  expect(await page.evaluate(() => Reflect.get(window, '__ersc_sunday_navigation_aborted__'))).toBe(
    true,
  );
  expect(
    await page.evaluate(() => Reflect.get(window, '__ersc_supersession_rolled_back__')),
  ).not.toBe(true);
  expect(browserErrors).toEqual([]);
});

test('follows a Routes middleware redirect during client navigation', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/');
  await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));

  const redirectedFlight = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/schedule' && isNavigationFlightRequest(request),
  );
  await page.getByRole('banner').getByRole('link', { name: 'Programme' }).click();
  await redirectedFlight;

  await expect(page).toHaveURL('/schedule/saturday');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__'))).toBe(true);
  expect(browserErrors).toEqual([]);
});

test('streams effectful speaker leaves independently within the conference schedule', async ({
  page,
}) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/schedule/saturday');

  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());

  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  const firstSpeaker = page.locator('[data-speaker-id="rohan-mehta"]');
  const lastSpeaker = page.locator('[data-speaker-id="jonah-kim"]');
  await expect(firstSpeaker).toBeVisible();
  await expect(lastSpeaker).toBeHidden();
  await expect(page.locator('[data-speaker-id="anika-rao"]')).toBeVisible();
  await expect(lastSpeaker).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('retains the root Layout when navigating from the landing page into a day', async ({
  page,
}) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/');

  const conferenceHeader = page.getByRole('banner');
  await conferenceHeader.evaluate((element) => Reflect.set(element, '__ersc_shell_marker__', true));

  await page
    .getByRole('link', { name: 'See the Saturday schedule' })
    .evaluate((element: HTMLAnchorElement) => element.click());

  await expect(page).toHaveURL('/schedule/saturday');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Converge' })).toBeHidden();
  expect(
    await conferenceHeader.evaluate((element) => Reflect.get(element, '__ersc_shell_marker__')),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});
