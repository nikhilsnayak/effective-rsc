// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based test boundary.
// oxlint-disable effecttsgo/node-builtin-import -- Playwright edits and restores watched fixture source within its test lifetime.
import { readFile, writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const probePath = new URL('../src/modules/fixture/components/runtime-probe.tsx', import.meta.url);
const homePath = new URL('../src/modules/fixture/components/fixture-home.tsx', import.meta.url);

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'dev', 'These contracts exercise the development server.');
});

test('recovers caught React errors on explicit navigation without a document reload', async ({
  page,
}) => {
  await page.goto('/');
  const documentIdentity = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole('button', { name: 'Fail React render' }).click();
  const panel = page.locator('ersc-dev-panel');
  await expect(panel).toContainText('Fixture React render failure');
  await expect(panel).toContainText('React component stack');
  await panel.getByRole('button', { name: 'Close development panel' }).click();
  await page.evaluate(() => navigation.navigate('/catalog/primary').finished);
  await expect(page.getByRole('navigation', { name: 'Fixture catalog' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Runtime failures' })).toHaveCount(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentIdentity);
});

for (const missingApi of ['None', 'navigation', 'NavigationPrecommitController']) {
  test(`refreshes RSC and preserves client state with missing API: ${missingApi}`, async ({
    page,
  }) => {
    if (missingApi !== 'None') {
      await page.addInitScript((api) => {
        Object.defineProperty(window, api, { configurable: true, value: undefined });
      }, missingApi);
    }
    const original = await readFile(homePath, 'utf8');
    await page.goto('/');
    await page.getByRole('button', { name: 'Probe count: 0' }).click();
    const documentIdentity = await page.evaluate(() => performance.timeOrigin);
    try {
      await writeFile(
        homePath,
        original.replace('RuntimeProbe />', 'RuntimeProbe /><p>RSC rebuild committed</p>'),
      );
      await expect(page.getByText('RSC rebuild committed', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Probe count: 1' })).toBeVisible();
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentIdentity);
    } finally {
      await writeFile(homePath, original);
      await expect(page.getByText('RSC rebuild committed', { exact: true })).toHaveCount(0);
    }
  });
}

test('keeps render diagnostics until corrected HMR actually recovers', async ({ page }) => {
  const original = await readFile(probePath, 'utf8');
  await page.goto('/');
  const documentIdentity = await page.evaluate(() => performance.timeOrigin);
  const panel = page.locator('ersc-dev-panel');
  try {
    await page.getByRole('button', { name: 'Fail React render' }).click();
    await expect(panel).toContainText('Fixture React render failure');
    await writeFile(
      probePath,
      original
        .replace(
          "if (phase === 'Failed')",
          "if (phase === 'Failed' || typeof window !== 'undefined')",
        )
        .replace('Fixture React render failure', 'Replacement still fails'),
    );
    await expect(panel).toContainText('Replacement still fails');
    await writeFile(
      probePath,
      original.replace('Runtime probe original', 'Runtime probe recovered'),
    );
    await expect(page.getByText('Runtime probe recovered', { exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Runtime failures' })).toHaveCount(0);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentIdentity);
  } finally {
    await writeFile(probePath, original);
    await expect(page.getByText('Runtime probe original', { exact: true })).toBeVisible();
  }
});
