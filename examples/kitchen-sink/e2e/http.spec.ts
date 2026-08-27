// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test } from '@playwright/test';

test('composes Effect HTTP middleware globally', async ({ request }) => {
  const response = await request.fetch('/schedule/saturday', {
    method: 'OPTIONS',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'https://app.converge.example',
    },
  });

  expect(response.status()).toBe(204);
  expect(response.headers()['access-control-allow-origin']).toBe('https://app.converge.example');
  expect(response.headers()['access-control-allow-methods']).toBe('GET, HEAD');
});
