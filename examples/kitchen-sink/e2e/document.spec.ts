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
  const { body: html, response } = await getText(request, '/schedule/saturday', {
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
  expect(html).toContain('<title>effective-rsc Conf 2026 — Conference schedule</title>');
  expect(html).toContain('Loading conference schedule...');
  expect(html).toMatch(/<h1[^>]*>Saturday schedule<\/h1>/);
  expect(html).toContain('self.__FLIGHT_DATA');
  expect(html).not.toContain('effective-rsc-root');
});

test('reveals the loading UI before the suspended schedule', async ({ page }) => {
  await page.goto('/schedule/saturday', { waitUntil: 'commit' });

  await expect(page.getByText('Loading conference schedule...')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeVisible();
  await expect(page.locator('[data-speaker-id="leena-shah"]')).toBeVisible();
});

test('shows the framework fallback when the Navigation API is unavailable', async ({ page }) => {
  const browserErrors = observeBrowserErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { configurable: true, value: undefined });
  });
  await page.goto('/schedule/saturday');

  await expect(page.getByRole('heading', { level: 1, name: 'Unsupported browser' })).toBeVisible();
  await expect(
    page.getByText('effective-rsc requires the Navigation API and NavigationPrecommitController.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday schedule' })).toBeHidden();
  expect(browserErrors).toEqual([]);
});

test('starts independent route concerns concurrently', async ({ request }) => {
  const { body: html } = await getText(request, '/schedule/saturday');
  const latestStart = Math.max(
    readRenderTimestamp(html, 'data-conference-started-at'),
    readRenderTimestamp(html, 'data-schedule-started-at'),
    readRenderTimestamp(html, 'data-agenda-started-at'),
  );
  const earliestCompletion = Math.min(
    readRenderTimestamp(html, 'data-conference-completed-at'),
    readRenderTimestamp(html, 'data-schedule-completed-at'),
    readRenderTimestamp(html, 'data-agenda-completed-at'),
  );

  expect(latestStart).toBeLessThan(earliestCompletion);
});
