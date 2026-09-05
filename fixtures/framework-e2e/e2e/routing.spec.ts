// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test } from '@playwright/test';

import { getText } from './support/http';

test('renders every declared route as HTML and Flight', async ({ request }) => {
  const html = await getText(request, '/catalog/secondary?source=integration');
  const flight = await getText(request, '/catalog/secondary', { accept: 'text/x-component' });

  expect(html.response.status()).toBe(200);
  expect(html.body).toContain('<title>ERSC Framework Fixture — Integration contracts</title>');
  expect(html.body).toMatch(/<h1[^>]*>Secondary catalog<\/h1>/);
  expect(html.body).toContain('Server Function mutation');
  expect(html.body).not.toMatch(/<h1[^>]*>Primary catalog<\/h1>/);

  expect(flight.response.status()).toBe(200);
  expect(flight.body).toContain('Secondary catalog');
  expect(flight.body).toContain('"formState":null');
});

test('renders a parameter-free Page at the application root', async ({ request }) => {
  const html = await getText(request, '/');
  const flight = await getText(request, '/', { accept: 'text/x-component' });

  expect(html.response.status()).toBe(200);
  expect(html.body).toContain('<title>ERSC Framework Fixture — Integration contracts</title>');
  expect(html.body).toMatch(/<h1[^>]*>ERSC Framework Fixture<\/h1>/);
  expect(html.body).toContain(
    'A neutral application dedicated to effective-rsc integration contracts.',
  );
  expect(html.body).toContain('/catalog/primary');
  expect(html.body).not.toMatch(/<h1[^>]*>Primary catalog<\/h1>/);

  expect(flight.response.status()).toBe(200);
  expect(flight.body).toContain('In-memory SQLite');
  expect(flight.body).toContain('"formState":null');
});

test('retains the native router response for unknown paths', async ({ request }) => {
  const html = await getText(request, '/missing');
  const flight = await getText(request, '/missing', { accept: 'text/x-component' });

  expect(html.response.status()).toBe(404);
  expect(html.body).toBe('');
  expect(flight.response.status()).toBe(404);
  expect(flight.body).toBe('');
});

test('returns an empty 404 when a matched Page rejects its parameters', async ({ request }) => {
  for (const accept of ['text/html', 'text/x-component']) {
    const response = await request.get('/catalog/invalid', { headers: { accept } });
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe('');
    expect(response.headers()['vary']).toContain('Accept');
    const head = await request.head('/catalog/invalid', { headers: { accept } });
    expect(head.status()).toBe(404);
    expect(await head.body()).toHaveLength(0);
  }
});

test('falls back to a native 404 document when navigation parameters are rejected', async ({
  page,
}) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Open the Primary catalog' });
  await link.evaluate((element) => element.setAttribute('href', '/catalog/invalid'));
  await page.evaluate(() => Reflect.set(window, '__ersc_previous_document__', true));
  const flight = page.waitForResponse(
    (response) =>
      response.url().endsWith('/catalog/invalid') && !response.request().isNavigationRequest(),
  );
  const document = page.waitForResponse(
    (response) =>
      response.url().endsWith('/catalog/invalid') && response.request().isNavigationRequest(),
  );
  await link.click();
  expect((await flight).status()).toBe(404);
  expect((await document).status()).toBe(404);
  await page.waitForURL('**/catalog/invalid');
  expect(
    await page.evaluate(() => Reflect.get(window, '__ersc_previous_document__')),
  ).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'ERSC Framework Fixture' })).toHaveCount(0);
});
