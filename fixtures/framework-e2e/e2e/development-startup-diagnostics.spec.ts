// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based test boundary.
// oxlint-disable effecttsgo/node-builtin-import -- Playwright edits and restores watched fixture source within its test lifetime.
import { readFile, writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const applicationPath = new URL('../src/application.tsx', import.meta.url);

test('reports application startup failure and clears it after successful replacement', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'dev', 'This contract exercises the development server.');
  const original = await readFile(applicationPath, 'utf8');
  await page.goto('/');
  await page.getByRole('button', { name: 'Probe count: 0' }).click();
  const documentIdentity = await page.evaluate(() => performance.timeOrigin);
  const panel = page.locator('ersc-dev-panel');
  try {
    await writeFile(
      applicationPath,
      original
        .replace("import { Layer } from 'effect';", "import { Effect, Layer } from 'effect';")
        .replace(
          'Layer.mergeAll(SelectionHttpLayer, PublicHttpLayer)',
          'Layer.mergeAll(SelectionHttpLayer, PublicHttpLayer, Layer.effectDiscard(Effect.fail(new Error("Fixture startup failed"))))',
        ),
    );
    await expect.poll(async () => (await request.get('/')).status()).toBe(500);
    await expect(panel.getByRole('heading', { name: 'Build failed' })).toBeVisible();
    await expect(panel).toContainText('Fixture startup failed');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentIdentity);
  } finally {
    await writeFile(applicationPath, original);
    await expect.poll(async () => (await request.get('/')).status()).toBe(200);
    await expect(panel.getByRole('heading', { name: 'Build failed' })).toHaveCount(0);
  }
});
