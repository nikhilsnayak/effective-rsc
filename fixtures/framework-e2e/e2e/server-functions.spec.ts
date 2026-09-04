// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';
import { itemCard, setItemSelection } from './support/catalog-page';
import { observeViewTransitions, waitForViewTransition } from './support/view-transitions';

const observeCatalogFallback = (page: Parameters<typeof observeBrowserErrors>[0]) =>
  page.evaluate(() => {
    const fallbackIsVisible = () => {
      const fallback = document.querySelector('main[aria-label="Loading catalog"]');
      if (fallback !== null && fallback.getClientRects().length > 0) {
        Reflect.set(window, '__ersc_catalog_fallback_seen__', true);
      }
    };
    const observer = new MutationObserver(fallbackIsVisible);
    observer.observe(document.body, { childList: true, subtree: true });
    Reflect.set(window, '__ersc_catalog_fallback_observer__', observer);
    Reflect.set(window, '__ersc_catalog_fallback_seen__', false);
    fallbackIsVisible();
  });

const readCatalogFallbackObservation = (page: Parameters<typeof observeBrowserErrors>[0]) =>
  page.evaluate(() => {
    const observer = Reflect.get(window, '__ersc_catalog_fallback_observer__');
    if (observer instanceof MutationObserver) {
      observer.disconnect();
    }
    return Reflect.get(window, '__ersc_catalog_fallback_seen__') === true;
  });

test.describe('Server Functions', () => {
  test('refreshes through a named ServerFn without revealing the route fallback', async ({
    page,
  }) => {
    const title = 'Service layer';
    const browserErrors = observeBrowserErrors(page);
    await page
      .context()
      .addCookies([
        { domain: 'localhost', name: 'fixture-actor', path: '/', value: 'Integration Actor' },
      ]);
    await observeViewTransitions(page);
    await page.goto('/catalog/primary');
    await expect(page.getByText('Personalized for Integration Actor')).toBeVisible();
    await setItemSelection(page, title, false);

    try {
      let item = itemCard(page, title);
      await observeCatalogFallback(page);
      await item.getByRole('button', { name: 'Add to the selection' }).click();

      await expect(item.getByText("Added to Integration Actor's selection.")).toBeVisible();
      await expect(item.getByRole('button', { name: 'Remove from the selection' })).toBeVisible();
      await waitForViewTransition(page, ['server-function']);
      const selection = page.locator('section[aria-labelledby="fixture-selection-heading"]');
      await expect(selection).not.toContainText(title);
      await expect(selection).toContainText(title);
      expect(await readCatalogFallbackObservation(page)).toBe(false);

      await page.reload();
      item = itemCard(page, title);
      await expect(item.getByRole('button', { name: 'Remove from the selection' })).toBeVisible();
      expect(browserErrors).toEqual([]);
    } finally {
      await page.goto('/catalog/primary');
      await setItemSelection(page, title, false);
    }
  });

  test('submits progressively when client navigation is unavailable', async ({ page }) => {
    const title = 'Navigation refresh';
    const browserErrors = observeBrowserErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'navigation', { configurable: true, value: undefined });
    });
    await page.goto('/catalog/primary');
    await setItemSelection(page, title, false);

    try {
      let item = itemCard(page, title);
      await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));
      const [response] = await Promise.all([
        page.waitForResponse((candidateResponse) => {
          const request = candidateResponse.request();
          return request.isNavigationRequest() && request.method() === 'POST';
        }),
        page.waitForEvent('load'),
        item.getByRole('button', { name: 'Add to the selection' }).click(),
      ]);

      expect(response.status()).toBe(200);
      item = itemCard(page, title);
      await expect(item.getByRole('button', { name: 'Remove from the selection' })).toBeVisible();
      expect(
        await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__')),
      ).toBeUndefined();
      await expect(item.getByText('Added to the selection.')).toBeVisible();
      await expect(
        page.locator('section[aria-labelledby="fixture-selection-heading"]'),
      ).toContainText(title);
      expect(browserErrors).toEqual([]);
    } finally {
      await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible({
        timeout: 15_000,
      });
      await setItemSelection(page, title, false);
    }
  });
});
