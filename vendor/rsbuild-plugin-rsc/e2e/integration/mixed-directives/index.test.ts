import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@e2e/helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname);

test('should render Counter component and button works correctly', async ({
  page,
  dev,
}) => {
  const rsbuild = await dev({
    cwd: PROJECT_DIR,
  });
  await page.goto(`http://localhost:${rsbuild.port}`);

  // Wait for the page to load
  await expect(page.locator('h1:has-text("Client rendered")')).toBeVisible();

  // Find the counter button
  const counterButton = page.locator('button:has-text("Count:")');
  await expect(counterButton).toBeVisible();

  // Verify initial count is 0
  await expect(counterButton).toHaveText('Count: 0');

  // Click the button and verify count increases
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 1');

  // Click again to verify it continues to work
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 2');

  // Click one more time
  await counterButton.click();
  await expect(counterButton).toHaveText('Count: 3');
});

test('should apply correct button color from CSS', async ({ page, dev }) => {
  const rsbuild = await dev({
    cwd: PROJECT_DIR,
  });
  await page.goto(`http://localhost:${rsbuild.port}`);

  // Wait for the page to load
  await expect(page.locator('h1:has-text("Client rendered")')).toBeVisible();

  // Find the counter button
  const counterButton = page.locator('button:has-text("Count:")');
  await expect(counterButton).toBeVisible();

  // Check if the button has the correct background color (#4CAF50)
  const backgroundColor = await counterButton.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor;
  });

  // #4CAF50 converts to rgb(76, 175, 80)
  expect(backgroundColor).toBe('rgb(76, 175, 80)');
});
