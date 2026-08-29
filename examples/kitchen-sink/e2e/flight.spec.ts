// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test, type APIRequestContext } from '@playwright/test';

import { getText } from './support/http';

const requestFlight = (request: APIRequestContext, pathname = '/schedule/saturday') =>
  getText(request, pathname, {
    accept: 'text/x-component',
    origin: 'https://app.converge.example',
  });

test('serves the complete application route tree through the native Flight protocol', async ({
  request,
}) => {
  const { body: flight, response } = await requestFlight(request, '/schedule');

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/x-component;charset=utf-8');
  expect(response.headers()['content-location']).toBe(response.url());
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(
    response
      .headers()
      ['vary']?.split(',')
      .map((field) => field.trim())
      .sort(),
  ).toEqual(['Accept', 'Origin']);
  expect(response.headers()['access-control-allow-origin']).toBe('https://app.converge.example');
  expect(flight).toContain('Saturday schedule');
  expect(flight).toContain('Server Components from first principles');
  expect(flight).toContain('Conference agenda');
  expect(flight).toContain('"formState":null');
  expect(flight).toContain('"routeTree"');
});

test('isolates ERSC runtimes across concurrent Flight requests', async ({ request }) => {
  const [saturday, sunday] = await Promise.all([
    requestFlight(request),
    requestFlight(request, '/schedule/sunday'),
  ]);

  expect(saturday.response.status()).toBe(200);
  expect(sunday.response.status()).toBe(200);
  expect(saturday.body).toContain('Saturday schedule');
  expect(saturday.body).toContain('Nikhil Nayak');
  expect(saturday.body).not.toContain('Rohan Mehta');
  expect(sunday.body).toContain('Sunday schedule');
  expect(sunday.body).toContain('Rohan Mehta');
  expect(sunday.body).not.toContain('Nikhil Nayak');
});
