// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based test boundary.
// oxlint-disable effecttsgo/node-builtin-import -- Playwright edits and restores watched fixture source within its test lifetime.
import { readFile, writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const probePath = new URL('../src/modules/fixture/components/runtime-probe.tsx', import.meta.url);

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'dev', 'This contract exercises the development server.');
});

test('reconciles a newer initial socket snapshot with the loaded browser bundle', async ({
  page,
  request,
}) => {
  const original = await readFile(probePath, 'utf8');
  const subscribe = Promise.withResolvers<void>();
  await page.routeWebSocket('**/_ersc/dev', (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      void subscribe.promise.then(() => server.send(message));
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Probe count: 0' }).click();
  const documentIdentity = await page.evaluate(() => performance.timeOrigin);
  try {
    await writeFile(
      probePath,
      original.replace('Runtime probe original', 'Runtime probe snapshot'),
    );
    await expect
      .poll(async () => (await request.get('/')).text())
      .toContain('Runtime probe snapshot');
    subscribe.resolve();
    await expect(page.getByText('Runtime probe snapshot', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Probe count: 1' })).toBeVisible();
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentIdentity);
  } finally {
    subscribe.resolve();
    await writeFile(probePath, original);
    await expect(page.getByText('Runtime probe original', { exact: true })).toBeVisible();
  }
});
