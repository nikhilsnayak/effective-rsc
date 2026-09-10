// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test, type APIRequestContext } from '@playwright/test';

import { getText } from './support/http';

const requestFlight = (request: APIRequestContext, pathname = '/catalog/primary') =>
  getText(request, pathname, {
    accept: 'text/x-component',
    origin: 'https://app.effective-rsc.example',
  });

test('serves the complete application route tree through the native Flight protocol', async ({
  request,
}) => {
  const { body: flight, response } = await requestFlight(request, '/catalog');

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
  expect(response.headers()['access-control-allow-origin']).toBe(
    'https://app.effective-rsc.example',
  );
  expect(flight).toContain('Primary catalog');
  expect(flight).toContain('Document stream');
  expect(flight).toContain('Fixture selection');
  expect(flight).toContain('"formState":null');
  expect(flight).toContain('"routeTree"');
});

test('isolates ERSC runtimes across concurrent Flight requests', async ({ request }) => {
  const [primary, secondary] = await Promise.all([
    getText(request, '/catalog/primary', {
      accept: 'text/x-component',
      cookie: 'fixture-actor=Alice',
    }),
    getText(request, '/catalog/secondary', {
      accept: 'text/x-component',
      cookie: 'fixture-actor=Bob',
    }),
  ]);

  expect(primary.response.status()).toBe(200);
  expect(secondary.response.status()).toBe(200);
  expect(primary.body).toContain('Primary catalog');
  expect(primary.body).toContain('Primary detail A');
  expect(primary.body).not.toContain('Secondary detail A');
  expect(secondary.body).toContain('Secondary catalog');
  expect(secondary.body).toContain('Secondary detail A');
  expect(secondary.body).not.toContain('Primary detail A');
  expect(primary.body).toContain(JSON.stringify(['Personalized for ', 'Alice']));
  expect(primary.body).not.toContain(JSON.stringify(['Personalized for ', 'Bob']));
  expect(secondary.body).toContain(JSON.stringify(['Personalized for ', 'Bob']));
  expect(secondary.body).not.toContain(JSON.stringify(['Personalized for ', 'Alice']));

  // Confirm the requests overlapped during their asynchronous catalog queries.
  const queries = [primary, secondary].map(({ body }) => ({
    startedAt: Number(body.match(/"data-catalog-started-at":(\d+)/)?.[1]),
    completedAt: Number(body.match(/"data-catalog-completed-at":(\d+)/)?.[1]),
  }));
  expect(Math.max(...queries.map((query) => query.startedAt))).toBeLessThan(
    Math.min(...queries.map((query) => query.completedAt)),
  );
});
