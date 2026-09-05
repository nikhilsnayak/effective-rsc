// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based test boundary.
// oxlint-disable effecttsgo/node-builtin-import -- Playwright edits and restores watched fixture source within its test lifetime.
import { readFile, writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { observeViewTransitions, waitForViewTransition } from './support/view-transitions';

const homePath = new URL('../src/modules/fixture/components/fixture-home.tsx', import.meta.url);

test('keeps build diagnostics after a cached navigation commits', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'dev', 'This contract exercises the development server.');
  const original = await readFile(homePath, 'utf8');
  await observeViewTransitions(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Probe count: 0' }).click();
  const documentIdentity = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate(() => navigation.navigate('/catalog/primary').finished);
  await expect(page.locator('[data-detail-id="primary-suspense"]')).toBeVisible();
  const panel = page.locator('ersc-dev-panel');
  try {
    await writeFile(homePath, `${original}\nexport const broken = ;\n`);
    await expect(panel.getByRole('heading', { name: 'Build failed' })).toBeVisible();
    await page.evaluate(() => navigation.back().finished);
    await waitForViewTransition(page, ['navigation', 'navigation-traverse', 'navigation-backward']);
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('button', { name: 'Probe count: 0', includeHidden: true }),
    ).toHaveCount(1);
    await expect(panel.getByRole('heading', { name: 'Build failed' })).toBeVisible();
    expect((await request.get('/')).status()).toBe(500);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentIdentity);
  } finally {
    await writeFile(homePath, original);
    await expect(panel.getByRole('heading', { name: 'Build failed' })).toHaveCount(0);
    await expect.poll(async () => (await request.get('/')).status()).toBe(200);
  }
});
