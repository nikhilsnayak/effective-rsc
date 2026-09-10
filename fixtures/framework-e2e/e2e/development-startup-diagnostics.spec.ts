// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based test boundary.
// oxlint-disable effecttsgo/node-builtin-import -- Playwright edits and restores watched fixture source within its test lifetime.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const applicationPath = new URL('../src/application.tsx', import.meta.url);

test('recovers from stalled application startup after a source correction', async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'dev', 'This contract exercises the development server.');
  const original = await readFile(applicationPath, 'utf8');
  expect(original).toContain('layer: ApplicationLayer,');
  const markers = await mkdtemp(join(tmpdir(), 'ersc-stalled-startup-'));
  const startedPath = join(markers, 'started');
  const closedPath = join(markers, 'closed');
  try {
    await writeFile(
      applicationPath,
      original
        .replace(
          "import { Layer } from 'effect';",
          "import { Effect, FileSystem, Layer } from 'effect';",
        )
        .replace(
          'layer: ApplicationLayer,',
          `layer: Layer.merge(ApplicationLayer, Layer.effectDiscard(
            Effect.gen(function* () {
              const fs = yield* FileSystem.FileSystem;
              yield* Effect.addFinalizer(() => fs.writeFileString(${JSON.stringify(closedPath)}, 'closed').pipe(Effect.orDie));
              yield* fs.writeFileString(${JSON.stringify(startedPath)}, 'started');
              yield* Effect.never;
            })
          )),`,
        ),
    );
    await expect.poll(() => readFile(startedPath, 'utf8').catch(() => '')).toBe('started');
  } finally {
    await writeFile(applicationPath, original);
    // The startup finalizer still needs this directory until it writes the cleanup marker.
    await expect.poll(() => readFile(closedPath, 'utf8').catch(() => '')).toBe('closed');
    await rm(markers, { recursive: true, force: true });
  }
  const response = await request.get('/', { timeout: 10_000 });
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('Runtime probe original');
});

test('reports application startup failure and clears it after successful replacement', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'dev', 'This contract exercises the development server.');
  const original = await readFile(applicationPath, 'utf8');
  expect(original).toContain('layer: ApplicationLayer,');
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
          'layer: ApplicationLayer,',
          'layer: Layer.merge(ApplicationLayer, Layer.effectDiscard(Effect.fail(new Error("Fixture startup failed")))),',
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
