// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test } from '@playwright/test';

import { observeBrowserErrors } from './support/browser-errors';
import { getText } from './support/http';

const readRenderTimestamp = (html: string, attribute: string) => {
  const value = html.match(new RegExp(`${attribute}="(\\d+)"`))?.[1];
  expect(value, `rendered document should contain ${attribute}`).toBeDefined();

  return Number(value);
};

test('streams a complete React document with its hydration payload', async ({ request }) => {
  const { body: html, response } = await getText(request, '/catalog/primary', {
    origin: 'https://app.effective-rsc.example',
  });

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/html;charset=utf-8');
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(
    response
      .headers()
      ['vary']?.split(',')
      .map((field) => field.trim())
      .sort(),
  ).toEqual(['Accept', 'Origin']);
  expect(response.headers()['access-control-allow-origin']).toBe(
    'https://app.effective-rsc.example',
  );
  expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(html).toMatch(/<html[^>]* lang="en"[^>]*>/);
  expect(html).toContain('<title>ERSC Framework Fixture — Integration contracts</title>');
  expect(html).toContain('Loading fixture catalog...');
  expect(html).toMatch(/<h1[^>]*>Primary catalog<\/h1>/);
  expect(html).toContain('self.__FLIGHT_DATA');
  expect(html).not.toContain('effective-rsc-root');
});

test('reveals the loading UI before the suspended catalog', async ({ page }) => {
  await page.goto('/catalog/primary', { waitUntil: 'commit' });

  await expect(page.getByText('Loading fixture catalog...')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
  await expect(page.locator('[data-detail-id="primary-suspense"]')).toBeVisible();
});

for (const missingApi of ['navigation', 'NavigationPrecommitController']) {
  test(`serves a plain multi-page application without ${missingApi}`, async ({ page }) => {
    const browserErrors = observeBrowserErrors(page);
    await page.addInitScript((api) => {
      Object.defineProperty(window, api, { configurable: true, value: undefined });
    }, missingApi);
    await page.goto('/catalog/primary');

    await expect(page.getByRole('heading', { level: 1, name: 'Primary catalog' })).toBeVisible();
    await page.evaluate(() => Reflect.set(window, '__ersc_document_marker__', true));

    await page.getByRole('link', { name: 'Open Secondary' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Secondary catalog' })).toBeVisible();
    expect(
      await page.evaluate(() => Reflect.get(window, '__ersc_document_marker__')),
    ).toBeUndefined();
    expect(browserErrors).toEqual([]);
  });
}

test('starts independent route concerns concurrently', async ({ request }) => {
  const { body: html } = await getText(request, '/catalog/primary');
  const latestStart = Math.max(
    readRenderTimestamp(html, 'data-fixture-started-at'),
    readRenderTimestamp(html, 'data-catalog-started-at'),
    readRenderTimestamp(html, 'data-selection-started-at'),
  );
  const earliestCompletion = Math.min(
    readRenderTimestamp(html, 'data-fixture-completed-at'),
    readRenderTimestamp(html, 'data-catalog-completed-at'),
    readRenderTimestamp(html, 'data-selection-completed-at'),
  );

  expect(latestStart).toBeLessThan(earliestCompletion);
});
