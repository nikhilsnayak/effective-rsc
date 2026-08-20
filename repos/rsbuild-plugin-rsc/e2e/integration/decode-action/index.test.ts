import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(import.meta.dirname);

const setup = async (dev: Dev, build: Build, page: Page) => {
  const rsbuild =
    process.env.TEST_MODE === 'dev'
      ? await dev({ cwd: PROJECT_DIR })
      : await build({ cwd: PROJECT_DIR, runServer: true });

  await page.goto(`http://localhost:${rsbuild.port}/?__nojs`);
};

test('should decode a native server action form without JavaScript', async ({
  browser,
  dev,
  build,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  try {
    await setup(dev, build, page);

    await expect(page).toHaveTitle('decodeAction without JavaScript');
    await expect(page.locator('script')).toHaveCount(0);

    const message = `decoded at ${Date.now()}`;
    await page.getByLabel('Message').fill(message);

    const [actionRequest, response] = await Promise.all([
      page.waitForRequest((request) => request.method() === 'POST'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.getByRole('button', { name: 'Submit without JavaScript' }).click(),
    ]);

    expect(actionRequest.headers()['x-rsc-action']).toBeUndefined();
    expect(actionRequest.headers()['content-type']).toContain(
      'multipart/form-data',
    );
    expect(actionRequest.postData()).toContain('$ACTION_ID_');
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('submitted-message')).toHaveText(message);
  } finally {
    await context.close();
  }
});
