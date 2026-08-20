import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(import.meta.dirname);

const setup = async (dev: Dev, build: Build, page: Page) => {
  const rsbuild =
    process.env.TEST_MODE === 'dev'
      ? await dev({ cwd: PROJECT_DIR })
      : await build({ cwd: PROJECT_DIR, runServer: true });

  await page.goto(`http://localhost:${rsbuild.port}`);
  return rsbuild;
};

test('should process use client directives from node_modules', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  await expect(page.locator('h1')).toHaveText('Client rendered');
  await expect(page.locator('h2')).toHaveText('RSC from node_modules');

  const counterButton = page.getByTestId('node-modules-counter');
  await expect(counterButton).toHaveText('Node modules count: 0');

  await counterButton.click();
  await expect(counterButton).toHaveText('Node modules count: 1');
});
