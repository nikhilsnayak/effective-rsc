// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test, type APIRequestContext } from '@playwright/test';

import { getText } from './support/http';

const requestFlight = (request: APIRequestContext, pathname = '/schedule/saturday') =>
  getText(request, pathname, { accept: 'text/x-component' });

test('serves the complete application route tree through the native Flight protocol', async ({
  request,
}) => {
  const { body: flight, response } = await requestFlight(request);

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/x-component;charset=utf-8');
  expect(flight).toContain('Saturday schedule');
  expect(flight).toContain('Server Components from first principles');
  expect(flight).toContain('Your agenda');
  expect(flight).toContain('"formState":null');
  expect(flight).toContain('"routeTree"');
  expect(flight).toContain('"html"');
  expect(flight).toContain('"body"');
});

test('serializes Client Components as native module references', async ({ request }) => {
  const { body: flight } = await requestFlight(request);
  const moduleReferences = flight
    .split('\n')
    .filter((row) => /^[0-9a-f]+:I/.test(row))
    .map((row) => row.slice(row.indexOf(':I') + 2));

  expect(moduleReferences.length).toBeGreaterThan(0);
  expect(moduleReferences.some((reference) => reference.includes('RouteOutlet'))).toBe(true);
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
  expect(sunday.body).toContain('Sunday schedule');
  expect(sunday.body).toContain('Rohan Mehta');
});
