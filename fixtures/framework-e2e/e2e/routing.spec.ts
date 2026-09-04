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
