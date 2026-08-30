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

test('serves the selected agenda as a calendar download', async ({ request }) => {
  const response = await request.get('/agenda/calendar.ics');
  const calendar = await response.text();

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('text/calendar; charset=utf-8');
  expect(response.headers()['content-disposition']).toBe(
    'attachment; filename="converge-2026-agenda.ics"',
  );
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(calendar).toContain('BEGIN:VCALENDAR\r\n');
  expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
});
