// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test } from '@playwright/test';

test('composes Effect HTTP middleware globally', async ({ request }) => {
  const response = await request.fetch('/catalog/primary', {
    method: 'OPTIONS',
    headers: {
      'access-control-request-method': 'GET',
      origin: 'https://app.effective-rsc.example',
    },
  });

  expect(response.status()).toBe(204);
  expect(response.headers()['access-control-allow-origin']).toBe(
    'https://app.effective-rsc.example',
  );
  expect(response.headers()['access-control-allow-methods']).toBe('GET, HEAD');
});

test('serves selected state through a userland Effect HTTP route', async ({ request }) => {
  const response = await request.get('/selection/export.csv');
  const manifest = await response.text();

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/csv; charset=utf-8');
  expect(response.headers()['content-disposition']).toBe(
    'attachment; filename="framework-fixture-selection.csv"',
  );
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(manifest).toContain('# ERSC Framework Fixture\n');
  expect(manifest).toContain('group,slot,id,title\n');
  expect(manifest.split('\n')).toHaveLength(7);
});
