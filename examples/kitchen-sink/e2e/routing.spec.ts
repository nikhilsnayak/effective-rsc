// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test } from '@playwright/test';

import { getText } from './support/http';

test('renders every declared route as HTML and Flight', async ({ request }) => {
  const html = await getText(request, '/schedule/day-two?source=integration');
  const flight = await getText(request, '/schedule/day-two', { accept: 'text/x-component' });

  expect(html.response.status()).toBe(200);
  expect(html.body).toContain('<title>Converge 2026 — Conference schedule</title>');
  expect(html.body).toMatch(/<h1[^>]*>Sunday schedule<\/h1>/);
  expect(html.body).toContain('Mutation protocols that compose');
  expect(html.body).not.toMatch(/<h1[^>]*>Saturday schedule<\/h1>/);

  expect(flight.response.status()).toBe(200);
  expect(flight.body).toContain('Sunday schedule');
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
