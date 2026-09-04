// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test, type Page, type Request } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';

const isNavigationFlightRequest = (request: Request) =>
  request.method() === 'GET' && request.headers()['accept'] === 'text/x-component';

type ViewTransitionObservation = {
  status: 'Finished' | 'Rejected' | 'Started';
  readonly types: ReadonlyArray<string>;
};

const observeViewTransitions = (page: Page) =>
  page.addInitScript(() => {
    const startViewTransition = document.startViewTransition.bind(document);
    Reflect.set(window, '__ersc_view_transitions__', []);
    Reflect.set(document, 'startViewTransition', (...args: ReadonlyArray<unknown>) => {
      const transition = Reflect.apply(startViewTransition, document, args) as ViewTransition;
      const transitions = Reflect.get(
        window,
        '__ersc_view_transitions__',
      ) as Array<ViewTransitionObservation>;
      const options = args[0];
      const types =
        typeof options === 'object' &&
        options !== null &&
        Array.isArray(Reflect.get(options, 'types'))
          ? (Reflect.get(options, 'types') as ReadonlyArray<string>)
          : [];
      const observation: ViewTransitionObservation = { status: 'Started', types };
      transitions.push(observation);
      void transition.finished.then(
        () => {
          observation.status = 'Finished';
        },
        () => {
          observation.status = 'Rejected';
        },
      );
      return transition;
    });
  });

const waitForViewTransition = (page: Page, types: ReadonlyArray<string>) =>
  expect
    .poll(
      () => page.evaluate(() => JSON.stringify(Reflect.get(window, '__ersc_view_transitions__'))),
      { timeout: 3_000 },
    )
    .toContain(JSON.stringify({ status: 'Finished', types }));

test('moves between conference days through the composed schedule', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  let navigationFlightFinished = false;
  await observeViewTransitions(page);
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
  const sundayNavigation = conferenceNavigation.getByRole('link', { name: 'Sunday 23 Aug' });
  const flightRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/schedule/sunday' && isNavigationFlightRequest(request),
  );
  const navigationStartedAtScrollY = await sundayNavigation.evaluate(
    (element: HTMLAnchorElement) => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      element.focus({ preventScroll: true });
      const scrollY = window.scrollY;
      element.click();
      return scrollY;
    },
  );
  expect(navigationStartedAtScrollY).toBeGreaterThan(0);
  // The destination page deliberately takes two seconds. Loading must commit from the streamed
  // route shell rather than appearing only after the page row has resolved.
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page).toHaveURL('/schedule/sunday');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeHidden();
  await page.waitForFunction(() => window.navigation.transition === null);
  await expect(page.locator('body')).toBeFocused();
  // This covers the current forward-navigation reset, not history restoration for streamed UI.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await waitForViewTransition(page, ['navigation', 'navigation-push', 'navigation-forward']);
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
  await observeViewTransitions(page);
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
  await expect(page.locator('[data-speaker-id="jonah-kim"]')).toBeVisible();

  await page.evaluate(() => window.navigation.back().finished);
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await waitForViewTransition(page, ['navigation', 'navigation-traverse', 'navigation-backward']);

  await page.evaluate(() => window.navigation.forward().finished);
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();

  expect(flightRequests).toEqual(['/schedule/sunday']);
  expect(browserErrors).toEqual([]);
});

// OQ-009: native restoration clamps the saved offset against the shorter Suspense fallback and
// does not recover it when the complete route expands the document.
test.skip('restores a streamed history entry to its saved scroll position', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const sundayFlightRequests: Array<Request> = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/schedule/sunday' &&
      isNavigationFlightRequest(request)
    ) {
      sundayFlightRequests.push(request);
    }
  });

  await page.goto('/schedule/saturday');
  const conferenceNavigation = page.getByRole('navigation', { name: 'Conference schedule' });
  await conferenceNavigation
    .getByRole('link', { name: 'Sunday 23 Aug' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);
  await expect(page.locator('[data-speaker-id="jonah-kim"]')).toBeHidden();

  const savedScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(savedScrollY).toBeGreaterThan(0);
  await conferenceNavigation
    .getByRole('link', { name: 'Saturday 22 Aug' })
    .evaluate((element: HTMLAnchorElement) => {
      element.focus({ preventScroll: true });
      element.click();
    });
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);

  await page.evaluate(() => {
    void window.navigation.back();
  });
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page).toHaveURL('/schedule/sunday');
  await page.waitForFunction(() => window.navigation.transition === null);
  expect(sundayFlightRequests).toHaveLength(2);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(savedScrollY);

  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await expect(page.locator('[data-speaker-id="jonah-kim"]')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(savedScrollY);
  expect(browserErrors).toEqual([]);
});

test('supersedes a streaming navigation with a fresh push to the stable URL', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const saturdayFlightRequests: Array<Request> = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/schedule/saturday' &&
      isNavigationFlightRequest(request)
    ) {
      saturdayFlightRequests.push(request);
    }
  });

  await page.goto('/schedule/saturday');
  const initialStartedAt = await page
    .locator('main[data-schedule-started-at]')
    .getAttribute('data-schedule-started-at');
  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page).toHaveURL('/schedule/sunday');

  await page
    .getByRole('navigation', { name: 'Conference schedule' })
    .getByRole('link', { name: 'Saturday 22 Aug' })
    .evaluate((element: HTMLAnchorElement) => element.click());

  await expect(page).toHaveURL('/schedule/saturday');
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);
  expect(
    await page.locator('main[data-schedule-started-at]').getAttribute('data-schedule-started-at'),
  ).not.toBe(initialStartedAt);
  expect(saturdayFlightRequests).toHaveLength(1);
  expect(browserErrors).toEqual([]);
});

test('lets Back supersede a streaming push without restoring over it', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);

  await page.goto('/schedule/saturday');
  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('main', { name: 'Loading schedule' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page).toHaveURL('/schedule/sunday');

  const outcome = await page.evaluate(() => {
    const finished = window.navigation.back().finished;
    return finished === undefined
      ? ('unavailable' as const)
      : finished.then(
          () => 'finished' as const,
          () => 'rejected' as const,
        );
  });

  expect(outcome).toBe('finished');
  await expect(page).toHaveURL('/schedule/saturday');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('keeps a committed Flight alive while its successor prepares', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/schedule/saturday');
  await page
    .getByRole('link', { name: 'See Sunday' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Sunday schedule' })).toBeVisible();
  await expect(page).toHaveURL('/schedule/sunday');
  await page.waitForFunction(() => window.navigation.transition === null);
  const firstSpeaker = page.locator('[data-speaker-id="rohan-mehta"]');
  const lastSpeaker = page.locator('[data-speaker-id="jonah-kim"]');
  await expect(firstSpeaker).toBeVisible();
  await expect(lastSpeaker).toBeHidden();

  const releaseSaturdayFlight = Promise.withResolvers<void>();
  await page.route(
    (url) => url.pathname === '/schedule/saturday',
    // oxlint-disable-next-line effecttsgo/async-function -- Playwright owns this Promise boundary.
    async (route, request) => {
      if (isNavigationFlightRequest(request)) {
        await releaseSaturdayFlight.promise;
      }
      await route.continue();
    },
  );
  await page
    .getByRole('navigation', { name: 'Conference schedule' })
    .getByRole('link', { name: 'Saturday 22 Aug' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(lastSpeaker).toBeVisible();
  await expect(page).toHaveURL('/schedule/sunday');
  await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeHidden();

  releaseSaturdayFlight.resolve();
  await expect(page).toHaveURL('/schedule/saturday');
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
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
  await page.waitForFunction(() => window.navigation.transition === null);
  await expect(page.getByRole('heading', { level: 1, name: 'effective-rsc Conf' })).toBeHidden();
  expect(
    await conferenceHeader.evaluate((element) => Reflect.get(element, '__ersc_shell_marker__')),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});
