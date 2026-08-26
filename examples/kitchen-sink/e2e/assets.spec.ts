// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test } from '@playwright/test';

import { getText } from './support/http';

const readClientModulePaths = (flight: string) =>
  flight
    .split('\n')
    .filter((row) => /^[0-9a-f]+:I/.test(row))
    .flatMap((row) => {
      const reference = JSON.parse(row.slice(row.indexOf(':I') + 2)) as unknown;
      if (!Array.isArray(reference) || !Array.isArray(reference[1])) {
        return [];
      }

      return reference[1]
        .filter((value): value is string => typeof value === 'string' && value.endsWith('.js'))
        .map((path) => `/_ersc/assets/${path}`);
    });

test('serves every stylesheet and client module referenced by the document', async ({
  request,
}) => {
  const { body: html } = await getText(request, '/schedule/saturday');
  const { body: flight } = await getText(request, '/schedule/saturday', {
    accept: 'text/x-component',
  });
  const stylesheetPaths = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)]
    .map((match) => match[1])
    .filter((path): path is string => path !== undefined);
  const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path): path is string => path !== undefined);
  const clientModulePaths = readClientModulePaths(flight);

  expect(stylesheetPaths.length).toBeGreaterThan(0);
  expect(stylesheetPaths.every((path) => path.startsWith('/_ersc/assets/'))).toBe(true);
  expect(scriptPaths).toContain('/_ersc/assets/main.js');

  for (const pathname of new Set([...stylesheetPaths, ...scriptPaths, ...clientModulePaths])) {
    const { body, response } = await getText(request, pathname);

    expect(response.status()).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    expect(response.headers()['content-type']).toContain(
      pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
    );
  }
});
