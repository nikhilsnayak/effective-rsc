import path from 'node:path';
import { type Dev, expect, patchFile, retry, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(
  import.meta.dirname,
  '../../../examples/client',
);

const setup = async (dev: Dev, page: Page) => {
  const rsbuild = await dev({
    cwd: PROJECT_DIR,
  });
  page.goto(`http://localhost:${rsbuild.port}`);
  return rsbuild;
};

test('should refetch RSC payload when server component is modified', async ({
  page,
  dev,
}) => {
  await setup(dev, page);

  // Verify initial state
  const clientHeader = page.locator('h1');
  await expect(clientHeader).toHaveText('Client rendered');

  const rscHeader = page.locator('h2');
  await expect(rscHeader).toHaveText('RSC!');

  // Modify the RSC.tsx file
  const rscTsxPath = path.join(PROJECT_DIR, 'server/RSC.tsx');

  await patchFile(
    rscTsxPath,
    (content) => content!.replace('<h2>RSC!</h2>', '<h2>HMR Test RSC</h2>'),
    async () => {
      await retry(async () => {
        const element = page.locator('h2');
        await expect(element).toHaveText('HMR Test RSC');
      });
    },
  );

  // Verify restoration after patchFile completes
  await retry(async () => {
    const element = page.locator('h2');
    await expect(element).toHaveText('RSC!');
  });
});

test('should preserve state when client component is modified', async ({
  page,
  dev,
}) => {
  await setup(dev, page);

  // Find the counter button
  const counterButton = page.locator('button', { hasText: 'Count:' });
  await expect(counterButton).toBeVisible();
  await expect(counterButton).toHaveText('Count: 0');

  // Click the button 3 times
  await counterButton.click();
  await counterButton.click();
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 3');

  // Modify the Counter.tsx file
  const counterTsxPath = path.join(PROJECT_DIR, 'server/Counter.tsx');

  await patchFile(
    counterTsxPath,
    (content) =>
      content!.replace(
        '<button type="button" onClick={() => setCount(count + 1)}>',
        '<button type="button" onClick={() => setCount(count + 1)} className="hmr-updated" data-hmr-test="true">',
      ),
    async () => {
      await retry(async () => {
        const updatedButton = page.locator('button.hmr-updated');
        await expect(updatedButton).toHaveAttribute('data-hmr-test', 'true');
      });
      // Verify counter state is preserved after hot reload
      await expect(counterButton).toHaveText('Count: 3');
    },
  );
});

test('should serve source maps via /__rsbuild_source_map endpoint', async ({
  page,
  dev,
}) => {
  const rsbuild = await setup(dev, page);

  // Wait for the page to load
  await expect(page.locator('h1')).toHaveText('Client rendered');

  // Request source map for the server bundle entry
  const response = await page.request.get(
    `http://localhost:${rsbuild.port}/__rsbuild_source_map?fileName=index.js&environmentName=Server`,
  );

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');

  const body = await response.json();
  expect(body).toHaveProperty('version');
  expect(body).toHaveProperty('sources');
  expect(body).toHaveProperty('mappings');

  // Verify that the source map contains references to our source files
  expect(body.sources.some((source: string) => source.includes('.tsx'))).toBe(
    true,
  );
});

test('should return 404 for non-existent source map', async ({ page, dev }) => {
  const rsbuild = await setup(dev, page);

  // Wait for the page to load
  await expect(page.locator('h1')).toHaveText('Client rendered');

  const response = await page.request.get(
    `http://localhost:${rsbuild.port}/__rsbuild_source_map?fileName=non-existent-file.js&environmentName=Server`,
  );

  expect(response.status()).toBe(404);
});

test('should return 400 when fileName parameter is missing', async ({
  page,
  dev,
}) => {
  const rsbuild = await setup(dev, page);

  // Wait for the page to load
  await expect(page.locator('h1')).toHaveText('Client rendered');

  const response = await page.request.get(
    `http://localhost:${rsbuild.port}/__rsbuild_source_map`,
  );

  expect(response.status()).toBe(400);
});
