import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Locator, Page } from 'playwright';

const PROJECT_DIR = path.resolve(
  import.meta.dirname,
  '../../../examples/react-router',
);

const setup = async (dev: Dev, build: Build, page: Page) => {
  const rsbuild =
    process.env.TEST_MODE === 'dev'
      ? await dev({ cwd: PROJECT_DIR })
      : await build({ cwd: PROJECT_DIR, runServer: true });

  await page.goto(`http://localhost:${rsbuild.port}`);
  return rsbuild;
};

const getStyle = (locator: Locator, property: string) =>
  locator.evaluate(
    (element, styleProperty) =>
      window.getComputedStyle(element).getPropertyValue(styleProperty),
    property,
  );

const expectReadyStatus = async (page: Page) => {
  const status = page.locator('.app-status');
  await expect(status).toHaveAttribute('data-navigation-state', 'idle');
  await expect(status).toHaveText('Ready');
};

const expectCounter = async (page: Page, count: number) => {
  const counter = page.locator('.counter-grid p[data-count]');
  await expect(counter).toHaveAttribute('data-count', String(count));
  await expect(counter).toHaveText(`Server count: ${count}`);
};

test('should render the shared layout, home content, and stylesheet', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  await expect(page.locator('.app-header strong')).toHaveText(
    'React Router Demo',
  );

  const homeLink = page.locator('.app-nav a', { hasText: 'Home' });
  const aboutLink = page.locator('.app-nav a', { hasText: 'About' });
  await expect(homeLink).toBeVisible();
  await expect(aboutLink).toBeVisible();
  await expect(homeLink).toHaveAttribute('aria-current', 'page');

  await expectReadyStatus(page);
  await expect(page.locator('.hero h1')).toHaveText(
    'React Router RSC on Rsbuild',
  );
  await expect(
    page.locator('.hero p', {
      hasText: 'React Router RSC Data Mode',
    }),
  ).toBeVisible();
  await expectCounter(page, 0);

  const stylesheets = page.locator('link[rel="stylesheet"]');
  await expect(stylesheets).toHaveCount(1);
});

test('should navigate to the about route on the client and update active nav state', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  const aboutLink = page.locator('.app-nav a', { hasText: 'About' });
  await aboutLink.click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('.panel h1')).toHaveText('About this demo');
  await expect(
    page.locator('.panel p', {
      hasText: 'This example deliberately keeps the adaptation small',
    }),
  ).toBeVisible();
  await expect(aboutLink).toHaveAttribute('aria-current', 'page');
  await expectReadyStatus(page);
});

test('should keep server action count across client-side navigation', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  const incrementButton = page.locator('.counter-button');

  await incrementButton.click();
  await expectCounter(page, 1);
  await expect(incrementButton).toHaveText('Increment server count');

  await incrementButton.click();
  await expectCounter(page, 2);
  await expect(incrementButton).toHaveText('Increment server count');

  await page.locator('.app-nav a', { hasText: 'About' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('.panel h1')).toHaveText('About this demo');

  await page.locator('.app-nav a', { hasText: 'Home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.hero h1')).toHaveText(
    'React Router RSC on Rsbuild',
  );
  await expectCounter(page, 2);
  await expectReadyStatus(page);
});

test('should apply active-nav and panel styles from the server entry stylesheet', async ({
  page,
  dev,
  build,
}) => {
  await setup(dev, build, page);

  const currentLink = page.locator('.app-nav a[aria-current="page"]');
  await expect(currentLink).toBeVisible();
  expect(await getStyle(currentLink, 'background-color')).toBe(
    'rgb(25, 34, 46)',
  );
  expect(await getStyle(currentLink, 'color')).toBe('rgb(248, 242, 232)');

  const panel = page.locator('.panel').first();
  await expect(panel).toBeVisible();
  expect(await getStyle(panel, 'background-color')).toBe(
    'rgba(255, 252, 247, 0.88)',
  );
  expect(await getStyle(panel, 'border-radius')).toBe('24px');
});
