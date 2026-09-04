import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(
  import.meta.dirname,
  '../../../examples/static',
);

const setup = async (dev: Dev, build: Build, page: Page) => {
  const rsbuild =
    process.env.TEST_MODE === 'dev'
      ? await dev({ cwd: PROJECT_DIR })
      : await build({ cwd: PROJECT_DIR, preview: true });

  await page.goto(`http://localhost:${rsbuild.port}`);
  return rsbuild;
};

test('should load the page and display the title', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  await expect(page).toHaveTitle('Static RSC');

  const heading = page.locator('h1');
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText('This is an RSC!');

  const links = page.locator('link[rel="stylesheet"]');
  await expect(links).toHaveCount(1);
});

test('should display and interact with Counter component', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  const counterButton = page.locator('button:has-text("Count:")');
  await expect(counterButton).toBeVisible();
  await expect(counterButton).toHaveText('Count: 0');

  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 1');

  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 2');

  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 3');
});

test('should navigate to Other page via client-side navigation', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Click the "Other" nav link
  const otherLink = page.locator('nav a:has-text("Other")');
  await expect(otherLink).toBeVisible();
  await otherLink.click();

  // Verify heading changes
  const heading = page.locator('h1');
  await expect(heading).toHaveText('This is another RSC!');

  // Verify URL changed
  await expect(page).toHaveURL(/\/other$/);
});

test('should apply CSS styles to current nav link', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  const currentLink = page.locator('nav a[aria-current="page"]');
  await expect(currentLink).toBeVisible();

  const backgroundColor = await currentLink.evaluate((el) =>
    window.getComputedStyle(el).getPropertyValue('background-color'),
  );
  expect(backgroundColor).toBe('rgb(0, 0, 0)');

  const color = await currentLink.evaluate((el) =>
    window.getComputedStyle(el).getPropertyValue('color'),
  );
  expect(color).toBe('rgb(255, 255, 255)');
});

test('should reset counter state on navigation', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  // Increment counter
  const counterButton = page.locator('button:has-text("Count:")');
  await counterButton.click();
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 2');

  // Navigate to Other page
  const otherLink = page.locator('nav a:has-text("Other")');
  await otherLink.click();
  await expect(page.locator('h1')).toHaveText('This is another RSC!');

  // Navigate back to Index page
  const indexLink = page.locator('nav a:has-text("Index")');
  await indexLink.click();
  await expect(page.locator('h1')).toHaveText('This is an RSC!');

  // Counter should be reset
  const resetCounter = page.locator('button:has-text("Count:")');
  await expect(resetCounter).toHaveText('Count: 0');
});
