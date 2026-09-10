// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, type Request } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';
import { test } from './support/queries';
import { expectViewTransition, observeViewTransitions } from './support/view-transitions';

const isNavigationFlightRequest = (request: Request) =>
  request.method() === 'GET' && request.headers()['accept'] === 'text/x-component';

test('moves between route groups through the composed catalog', async ({ page, holdQuery }) => {
  const secondary = await holdQuery('catalog-secondary');
  const browserErrors = observeBrowserErrors(page);
  let navigationFlightFinished = false;
  await observeViewTransitions(page);
  page.on('requestfinished', (request) => {
    if (
      new URL(request.url()).pathname === '/catalog/secondary' &&
      isNavigationFlightRequest(request)
    ) {
      navigationFlightFinished = true;
    }
  });
  await page.goto('/catalog/primary');
  await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));
  const fixtureNavigation = page.getByRole('navigation', { name: 'Fixture catalog' });
  await fixtureNavigation.evaluate((element) =>
    Reflect.set(element, '__ersc_segment_marker__', true),
  );
  const secondaryNavigation = fixtureNavigation.getByRole('link', { name: 'Secondary B' });
  const flightRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/catalog/secondary' &&
      isNavigationFlightRequest(request),
  );
  await expectViewTransition(
    page,
    ['navigation', 'navigation-push', 'navigation-forward'],
    async () => {
      const navigationStartedAtScrollY = await secondaryNavigation.evaluate(
        (element: HTMLAnchorElement) => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          element.focus({ preventScroll: true });
          const scrollY = window.scrollY;
          element.click();
          return scrollY;
        },
      );
      expect(navigationStartedAtScrollY).toBeGreaterThan(0);
      await secondary.waitUntilStarted();
      // The route shell must commit while its catalog query is still held.
      await expect(page.getByRole('main', { name: 'Loading catalog' })).toBeVisible();
      await expect(page).toHaveURL('/catalog/secondary');
      await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeHidden();
      await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeHidden();
      await page.waitForFunction(() => window.navigation.transition === null);
      await expect(page.locator('body')).toBeFocused();
      // This covers the current forward-navigation reset, not history restoration for streamed UI.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    },
  );
  expect(navigationFlightFinished).toBe(false);
  await flightRequest;
  await secondary.release();

  await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeVisible();
  await expect(page.getByText('Server Function mutation').first()).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__'))).toBe(true);
  expect(
    await fixtureNavigation.evaluate((element) => Reflect.get(element, '__ersc_segment_marker__')),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});

test('publishes native link types once without replaying them on history traversal', async ({
  page,
}) => {
  const browserErrors = observeBrowserErrors(page);
  await observeViewTransitions(page);
  await page.goto('/catalog/primary');
  const link = page.getByRole('link', { name: 'Open Secondary' });
  await link.evaluate((element: HTMLAnchorElement) => {
    element.dataset['erscTransitionTypes'] = 'docs-previous docs-previous section-change';
    const child = document.createElement('span');
    child.textContent = 'Nested link content';
    element.append(child);
  });
  await expectViewTransition(
    page,
    ['navigation', 'navigation-push', 'navigation-forward', 'docs-previous', 'section-change'],
    async () => {
      await link.getByText('Nested link content').click();
      await expect(page).toHaveURL('/catalog/secondary');
    },
  );
  await expect(page.locator('[data-detail-id="secondary-slow-stream"]')).toBeVisible();

  await expectViewTransition(
    page,
    ['navigation', 'navigation-traverse', 'navigation-backward'],
    () => page.evaluate(() => window.navigation.back().finished),
  );
  await expectViewTransition(
    page,
    ['navigation', 'navigation-traverse', 'navigation-forward'],
    () => page.evaluate(() => window.navigation.forward().finished),
  );

  await expectViewTransition(page, ['navigation', 'navigation-push', 'navigation-forward'], () =>
    page.evaluate(() => window.navigation.navigate('/catalog/primary').finished),
  );
  expect(browserErrors).toEqual([]);
});

test('types a replace navigation without inventing a direction', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  await observeViewTransitions(page);
  await page.goto('/catalog/primary');

  await expectViewTransition(page, ['navigation', 'navigation-replace'], async () => {
    await page.evaluate(
      () => window.navigation.navigate('/catalog/secondary', { history: 'replace' }).finished,
    );
    await expect(page).toHaveURL('/catalog/secondary');
  });
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

  await page.goto('/catalog/primary');
  await page
    .getByRole('link', { name: 'Open Secondary' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeVisible();
  await expect(page.locator('[data-detail-id="secondary-slow-stream"]')).toBeVisible();

  await expectViewTransition(
    page,
    ['navigation', 'navigation-traverse', 'navigation-backward'],
    async () => {
      await page.evaluate(() => window.navigation.back().finished);
      await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
    },
  );

  await expectViewTransition(
    page,
    ['navigation', 'navigation-traverse', 'navigation-forward'],
    async () => {
      await page.evaluate(() => window.navigation.forward().finished);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Secondary catalog' }),
      ).toBeVisible();
    },
  );

  expect(flightRequests).toEqual(['/catalog/secondary']);
  expect(browserErrors).toEqual([]);
});

// OQ-009: native restoration clamps the saved offset against the shorter Suspense fallback and
// does not recover it when the complete route expands the document.
test.skip('restores a streamed history entry to its saved scroll position', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  const secondaryFlightRequests: Array<Request> = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/catalog/secondary' &&
      isNavigationFlightRequest(request)
    ) {
      secondaryFlightRequests.push(request);
    }
  });

  await page.goto('/catalog/primary');
  const fixtureNavigation = page.getByRole('navigation', { name: 'Fixture catalog' });
  await fixtureNavigation
    .getByRole('link', { name: 'Secondary B' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);
  await expect(page.locator('[data-detail-id="secondary-slow-stream"]')).toBeHidden();

  const savedScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(savedScrollY).toBeGreaterThan(0);
  await fixtureNavigation
    .getByRole('link', { name: 'Primary A' })
    .evaluate((element: HTMLAnchorElement) => {
      element.focus({ preventScroll: true });
      element.click();
    });
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);

  await page.evaluate(() => {
    void window.navigation.back();
  });
  await expect(page.getByRole('main', { name: 'Loading catalog' })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page).toHaveURL('/catalog/secondary');
  await page.waitForFunction(() => window.navigation.transition === null);
  expect(secondaryFlightRequests).toHaveLength(2);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(savedScrollY);

  await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeVisible();
  await expect(page.locator('[data-detail-id="secondary-slow-stream"]')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(savedScrollY);
  expect(browserErrors).toEqual([]);
});

test('supersedes a streaming navigation with a fresh push to the stable URL', async ({
  page,
  holdQuery,
}) => {
  const secondary = await holdQuery('catalog-secondary');
  const browserErrors = observeBrowserErrors(page);
  const primaryFlightRequests: Array<Request> = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/catalog/primary' &&
      isNavigationFlightRequest(request)
    ) {
      primaryFlightRequests.push(request);
    }
  });

  await page.goto('/catalog/primary');
  const initialStartedAt = await page
    .locator('main[data-catalog-started-at]')
    .getAttribute('data-catalog-started-at');
  await page
    .getByRole('link', { name: 'Open Secondary' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('main', { name: 'Loading catalog' })).toBeVisible();
  await expect(page).toHaveURL('/catalog/secondary');

  await secondary.waitUntilStarted();
  const primary = await holdQuery('catalog-primary');
  await page
    .getByRole('navigation', { name: 'Fixture catalog' })
    .getByRole('link', { name: 'Primary A' })
    .evaluate((element: HTMLAnchorElement) => element.click());

  await expect(page).toHaveURL('/catalog/primary');
  await expect(page.getByRole('main', { name: 'Loading catalog' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeHidden();
  await primary.waitUntilStarted();
  await secondary.waitUntilCancelled();
  await primary.release();
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);
  expect(
    await page.locator('main[data-catalog-started-at]').getAttribute('data-catalog-started-at'),
  ).not.toBe(initialStartedAt);
  expect(primaryFlightRequests).toHaveLength(1);
  expect(browserErrors).toEqual([]);
});

test('lets Back supersede a streaming push without restoring over it', async ({
  page,
  holdQuery,
}) => {
  const secondary = await holdQuery('catalog-secondary');
  const browserErrors = observeBrowserErrors(page);

  await page.goto('/catalog/primary');
  await page
    .getByRole('link', { name: 'Open Secondary' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('main', { name: 'Loading catalog' })).toBeVisible();
  await expect(page).toHaveURL('/catalog/secondary');

  await secondary.waitUntilStarted();
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
  await secondary.waitUntilCancelled();
  await expect(page).toHaveURL('/catalog/primary');
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('keeps a committed Flight alive while its successor prepares', async ({ page, holdQuery }) => {
  const slowDetail = await holdQuery('detail-secondary-slow-stream');
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/catalog/primary');
  await page
    .getByRole('link', { name: 'Open Secondary' })
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeVisible();
  await expect(page).toHaveURL('/catalog/secondary');
  await page.waitForFunction(() => window.navigation.transition === null);
  const firstDetail = page.locator('[data-detail-id="secondary-history"]');
  const lastDetail = page.locator('[data-detail-id="secondary-slow-stream"]');
  await expect(firstDetail).toBeVisible();
  await slowDetail.waitUntilStarted();
  await expect(lastDetail).toBeHidden();

  const primaryFlightStarted = Promise.withResolvers<void>();
  const releasePrimaryFlight = Promise.withResolvers<void>();
  await page.route(
    (url) => url.pathname === '/catalog/primary',
    // oxlint-disable-next-line effecttsgo/async-function -- Playwright owns this Promise boundary.
    async (route, request) => {
      if (isNavigationFlightRequest(request)) {
        primaryFlightStarted.resolve();
        await releasePrimaryFlight.promise;
      }
      await route.continue();
    },
  );
  try {
    await page
      .getByRole('navigation', { name: 'Fixture catalog' })
      .getByRole('link', { name: 'Primary A' })
      .evaluate((element: HTMLAnchorElement) => element.click());
    await primaryFlightStarted.promise;
    await slowDetail.release();
    await expect(lastDetail).toBeVisible();
    await expect(page).toHaveURL('/catalog/secondary');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeHidden();
  } finally {
    releasePrimaryFlight.resolve();
  }
  await expect(page).toHaveURL('/catalog/primary');
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('follows a Routes middleware redirect during client navigation', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/');
  await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));

  const redirectedFlight = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/catalog' && isNavigationFlightRequest(request),
  );
  await page.getByRole('banner').getByRole('link', { name: 'Catalog' }).click();
  await redirectedFlight;

  await expect(page).toHaveURL('/catalog/primary');
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__'))).toBe(true);
  expect(browserErrors).toEqual([]);
});

test('streams effectful detail leaves independently within the fixture catalog', async ({
  page,
  holdQuery,
}) => {
  const slowDetail = await holdQuery('detail-secondary-slow-stream');
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/catalog/primary');

  await page
    .getByRole('link', { name: 'Open Secondary' })
    .evaluate((element: HTMLAnchorElement) => element.click());

  await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeVisible();
  const firstDetail = page.locator('[data-detail-id="secondary-history"]');
  const lastDetail = page.locator('[data-detail-id="secondary-slow-stream"]');
  await expect(firstDetail).toBeVisible();
  await slowDetail.waitUntilStarted();
  await expect(lastDetail).toBeHidden();
  await expect(page.locator('[data-detail-id="secondary-mutation"]')).toBeVisible();
  await slowDetail.release();
  await expect(lastDetail).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('retains the root Layout when navigating from the landing page into a route group', async ({
  page,
}) => {
  const browserErrors = observeBrowserErrors(page);
  await page.goto('/');

  const fixtureHeader = page.getByRole('banner');
  await fixtureHeader.evaluate((element) => Reflect.set(element, '__ersc_shell_marker__', true));

  await page
    .getByRole('link', { name: 'Open the Primary catalog' })
    .evaluate((element: HTMLAnchorElement) => element.click());

  await expect(page).toHaveURL('/catalog/primary');
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  await page.waitForFunction(() => window.navigation.transition === null);
  await expect(
    page.getByRole('heading', { level: 1, name: 'ERSC Framework Fixture' }),
  ).toBeHidden();
  expect(
    await fixtureHeader.evaluate((element) => Reflect.get(element, '__ersc_shell_marker__')),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});
