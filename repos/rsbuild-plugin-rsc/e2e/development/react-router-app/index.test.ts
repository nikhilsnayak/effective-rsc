import path from 'node:path';
import { type Dev, expect, patchFile, retry, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(
  import.meta.dirname,
  '../../../examples/react-router',
);

const setup = async (dev: Dev, page: Page) => {
  const rsbuild = await dev({
    cwd: PROJECT_DIR,
  });

  await page.goto(`http://localhost:${rsbuild.port}`);
  return rsbuild;
};

test('should refetch the home route when the server component changes', async ({
  page,
  dev,
}) => {
  await setup(dev, page);

  const heading = page.locator('.hero h1');
  await expect(heading).toHaveText('React Router RSC on Rsbuild');

  const homeRoutePath = path.join(PROJECT_DIR, 'src/routes/home/route.tsx');

  await patchFile(
    homeRoutePath,
    (content) =>
      content!.replace(
        '<h1>React Router RSC on Rsbuild</h1>',
        '<h1>HMR Test React Router</h1>',
      ),
    async () => {
      await retry(async () => {
        await expect(heading).toHaveText('HMR Test React Router');
      });
    },
  );

  await retry(async () => {
    await expect(heading).toHaveText('React Router RSC on Rsbuild');
  });
});

test('should preserve the displayed count when the client counter module updates', async ({
  page,
  dev,
}) => {
  await setup(dev, page);

  const counterText = page.locator('.counter-grid p[data-count]');
  const counterButton = page.locator('.counter-button');

  await counterButton.click();
  await expect(counterText).toHaveText('Server count: 1');

  await counterButton.click();
  await expect(counterText).toHaveText('Server count: 2');

  const counterPath = path.join(PROJECT_DIR, 'src/routes/home/counter.tsx');

  await patchFile(
    counterPath,
    (content) =>
      content!.replace(
        'className="counter-button"',
        'className="counter-button hmr-updated" data-hmr-test="true"',
      ),
    async () => {
      await retry(async () => {
        const updatedButton = page.locator('button.hmr-updated');
        await expect(updatedButton).toHaveAttribute('data-hmr-test', 'true');
      });

      await expect(counterText).toHaveAttribute('data-count', '2');
      await expect(counterText).toHaveText('Server count: 2');
    },
  );
});
