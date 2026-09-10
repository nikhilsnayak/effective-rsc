// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test, type Response } from '@playwright/test';

import { getText } from './support/http';

test('preserves useId associations through hydration and a client update', async ({ page }) => {
  const errors: Array<string> = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  const description = page.getByText('Runtime probe original', { exact: true });
  const descriptionId = await description.getAttribute('id');
  if (descriptionId === null) {
    throw new Error('Missing server-rendered useId.');
  }
  const button = page.getByRole('button', { name: 'Probe count: 0' });
  await expect(button).toHaveAttribute('aria-describedby', descriptionId);
  await button.click();
  await expect(page.getByRole('button', { name: 'Probe count: 1' })).toHaveAttribute(
    'aria-describedby',
    descriptionId,
  );
  expect(errors).toEqual([]);
});

test('loads every compiler asset needed by the hydrated document', async ({ page }, testInfo) => {
  const assetResponses: Array<Response> = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/_ersc/assets/')) {
      assetResponses.push(response);
    }
  });

  const documentResponse = await page.goto('/');
  expect(documentResponse?.status()).toBe(200);
  await page.getByRole('button', { name: 'Probe count: 0' }).click();
  await expect(page.getByRole('button', { name: 'Probe count: 1' })).toBeVisible();

  const responsesByPath = new Map(
    assetResponses.map((response) => [new URL(response.url()).pathname, response]),
  );
  const stylesheets = [...responsesByPath.keys()].filter((pathname) => pathname.endsWith('.css'));
  const scripts = [...responsesByPath.keys()].filter((pathname) => pathname.endsWith('.js'));

  expect(stylesheets.length).toBeGreaterThan(0);
  expect(scripts.some((pathname) => /^\/_ersc\/assets\/main\.[a-f0-9]+\.js$/.test(pathname))).toBe(
    true,
  );
  expect(scripts.length).toBeGreaterThan(1);

  const expectedCacheControl =
    testInfo.project.name === 'dev' ? 'no-store' : 'public, max-age=31536000, immutable';

  for (const [pathname, response] of responsesByPath) {
    expect(response.status()).toBe(200);
    expect((await response.body()).length).toBeGreaterThan(0);
    const headers = await response.allHeaders();
    expect(headers['content-type']).toContain(
      pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
    );
    expect(headers['cache-control']).toBe(expectedCacheControl);
  }
});

test('serves conventional public assets from the application root', async ({ request }) => {
  const [{ body, response }, favicon] = await Promise.all([
    getText(request, '/robots.txt'),
    getText(request, '/favicon.svg'),
  ]);

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8');
  expect(response.headers()['cache-control']).toBe('public, max-age=0');
  expect(response.headers()['access-control-allow-origin']).toBe(
    'https://app.effective-rsc.example',
  );
  expect(body).toBe('User-agent: *\nAllow: /\n');

  expect(favicon.response.status()).toBe(200);
  expect(favicon.response.headers()['content-type']).toContain('image/svg+xml');
  expect(favicon.response.headers()['cache-control']).toBe('public, max-age=0');
  expect(favicon.body).toContain('<svg');
});
