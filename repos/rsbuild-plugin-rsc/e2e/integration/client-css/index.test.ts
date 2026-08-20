import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(import.meta.dirname);

const setup = async (
  dev: Dev,
  build: Build,
  page: Page,
  options?: { nojs?: boolean },
) => {
  const rsbuild =
    process.env.TEST_MODE === 'dev'
      ? await dev({ cwd: PROJECT_DIR })
      : await build({ cwd: PROJECT_DIR, runServer: true });

  await page.goto(
    `http://localhost:${rsbuild.port}${options?.nojs ? '/?__nojs' : '/'}`,
  );
  return rsbuild;
};

const getStyle = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .evaluate(
      (element, styleProperty) =>
        window.getComputedStyle(element).getPropertyValue(styleProperty),
      property,
    );

test('should render CSS for client components without JavaScript', async ({
  browser,
  dev,
  build,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  try {
    await setup(dev, build, page, { nojs: true });

    await expect(page).toHaveTitle('Client CSS');

    const staticCard = page.getByTestId('static-client-card');
    await expect(staticCard).toBeVisible();
    await expect(staticCard).toContainText('Static client stylesheet');
    await expect(
      page.getByRole('button', { name: 'Static clicks: 0' }),
    ).toBeVisible();

    const dynamicCard = page.getByTestId('dynamic-client-card');
    await expect(dynamicCard).toBeVisible();
    await expect(dynamicCard).toContainText('Dynamic client stylesheet');
    await expect(
      page.getByRole('button', { name: 'Dynamic clicks: 0' }),
    ).toBeVisible();

    expect(
      await getStyle(
        page,
        '[data-testid="static-client-card"]',
        'background-color',
      ),
    ).toBe('rgb(69, 38, 107)');
    expect(
      await getStyle(
        page,
        '[data-testid="static-client-card"]',
        'border-top-color',
      ),
    ).toBe('rgb(124, 223, 205)');
    expect(
      await getStyle(page, '[data-testid="static-client-card"]', 'box-shadow'),
    ).toContain('rgba(69, 38, 107, 0.32)');

    expect(
      await getStyle(
        page,
        '[data-testid="dynamic-client-card"]',
        'background-color',
      ),
    ).toBe('rgb(9, 74, 83)');
    expect(
      await getStyle(
        page,
        '[data-testid="dynamic-client-card"]',
        'border-top-color',
      ),
    ).toBe('rgb(255, 207, 102)');
    expect(
      await getStyle(page, '[data-testid="dynamic-client-card"]', 'box-shadow'),
    ).toContain('rgba(9, 74, 83, 0.35)');
  } finally {
    await context.close();
  }
});

test('should hydrate client components', async ({ page, dev, build }) => {
  await setup(dev, build, page);

  const staticButton = page.getByTestId('static-client-button');
  await expect(staticButton).toBeVisible();
  await expect(staticButton).toHaveText('Static clicks: 0');

  const dynamicButton = page.getByTestId('dynamic-client-button');
  await expect(dynamicButton).toBeVisible();
  await expect(dynamicButton).toHaveText('Dynamic clicks: 0');

  await staticButton.click();
  await expect(staticButton).toHaveText('Static clicks: 1');

  await dynamicButton.click();
  await expect(dynamicButton).toHaveText('Dynamic clicks: 1');
});
