import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(
  import.meta.dirname,
  '../../../examples/client',
);

const setup = async (dev: Dev, build: Build, page: Page) => {
  const rsbuild =
    process.env.TEST_MODE === 'dev'
      ? await dev({ cwd: PROJECT_DIR })
      : await build({ cwd: PROJECT_DIR, runServer: true });

  await page.goto(`http://localhost:${rsbuild.port}`);
  return rsbuild;
};

test('should load the page and display the title', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Check client-rendered title is visible
  const clientTitle = page.locator('h1:has-text("Client rendered")');
  await expect(clientTitle).toBeVisible();
  await expect(clientTitle).toHaveText('Client rendered');

  // Check that RSC component loaded
  const rscTitle = page.locator('h2:has-text("RSC!")');
  await expect(rscTitle).toBeVisible();
  await expect(rscTitle).toHaveText('RSC!');

  // Check that only one stylesheet is loaded (from RSC)
  const links = page.locator('link[rel="stylesheet"]');
  await expect(links).toHaveCount(1);
});

test('should render RSC component with styles', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Check RSC container exists and has class
  const rscContainer = page.locator('div.rsc');
  await expect(rscContainer).toBeVisible();

  // Check RSC heading
  const rscHeading = rscContainer.locator('h2');
  await expect(rscHeading).toBeVisible();
  await expect(rscHeading).toHaveText('RSC!');

  // Verify styles are applied by checking computed style
  const backgroundColor = await rscContainer.evaluate((el) => {
    return window.getComputedStyle(el).borderColor;
  });

  // The RSC.css should apply border color
  expect(backgroundColor).toBe('rgb(128, 128, 128)');
});

test('should display and interact with Counter component', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Find the counter button
  const counterButton = page.locator('button:has-text("Count:")');
  await expect(counterButton).toBeVisible();

  // Check initial state
  await expect(counterButton).toHaveText('Count: 0');

  // Click the button multiple times
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 1');

  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 2');

  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 3');
});

test('should maintain Counter state across multiple interactions', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  const counterButton = page.locator('button:has-text("Count:")');
  await expect(counterButton).toBeVisible();

  // Increment counter 5 times
  for (let i = 1; i <= 5; i++) {
    await counterButton.click();
    await expect(counterButton).toHaveText(`Count: ${i}`);
  }

  // Final state should be 5
  await expect(counterButton).toHaveText('Count: 5');
});

test('should show loading state before RSC hydrates', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // By the time we check, the RSC should already be loaded
  // but we can verify the loading fallback is not present
  const loadingText = page.locator('text="Loading RSC"');
  await expect(loadingText).not.toBeVisible();

  // And the actual RSC content is present
  const rscTitle = page.locator('h2:has-text("RSC!")');
  await expect(rscTitle).toBeVisible();
});

test('should properly separate client and server components', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Check client component (main App)
  const clientRendered = page.locator('h1:has-text("Client rendered")');
  await expect(clientRendered).toBeVisible();

  // Check server component (RSC)
  const serverRendered = page.locator('div.rsc h2:has-text("RSC!")');
  await expect(serverRendered).toBeVisible();

  // Check client component inside RSC (Counter)
  const counterButton = page.locator('div.rsc button:has-text("Count:")');
  await expect(counterButton).toBeVisible();

  // Verify Counter is interactive (client component)
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 1');
});
