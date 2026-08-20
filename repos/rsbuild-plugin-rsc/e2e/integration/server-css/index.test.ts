import path from 'node:path';
import { type Build, type Dev, expect, test } from '@e2e/helper';
import type { Page } from 'playwright';

const PROJECT_DIR = path.resolve(import.meta.dirname);

type ServerCssPage = 'page1' | 'page2';

const startApp = async (dev: Dev, build: Build) =>
  process.env.TEST_MODE === 'dev'
    ? await dev({ cwd: PROJECT_DIR })
    : await build({ cwd: PROJECT_DIR, runServer: true });

const gotoPage = (page: Page, port: number, serverCssPage: ServerCssPage) =>
  page.goto(`http://localhost:${port}/?page=${serverCssPage}`);

const expectPageShell = async (page: Page, activePage: ServerCssPage) => {
  await expect(
    page.getByRole('heading', { name: 'Client shell' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Server CSS root' }),
  ).toBeVisible();
  const pageOneLink = page.getByRole('link', { name: 'Page 1' });
  const pageTwoLink = page.getByRole('link', { name: 'Page 2' });
  if (activePage === 'page1') {
    await expect(pageOneLink).toHaveAttribute('aria-current', 'page');
    await expect(pageTwoLink).not.toHaveAttribute('aria-current', 'page');
  } else {
    await expect(pageTwoLink).toHaveAttribute('aria-current', 'page');
    await expect(pageOneLink).not.toHaveAttribute('aria-current', 'page');
  }
};

test('should apply root CSS and server-entry page CSS by route', async ({
  page,
  dev,
  build,
}) => {
  const rsbuild = await startApp(dev, build);

  await gotoPage(page, rsbuild.port, 'page1');
  await expectPageShell(page, 'page1');
  await expect(page.getByRole('heading', { name: 'Page 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page 2' })).toHaveCount(0);
  await expect(page.getByTestId('server-css-shared-root')).toHaveText(
    'Shared stylesheet from root',
  );
  await expect(page.getByTestId('server-css-shared-page-one')).toHaveText(
    'Shared stylesheet from Page 1',
  );
  await expect(page.getByTestId('server-css-shared-root')).toHaveCSS(
    'color',
    'rgb(46, 139, 87)',
  );
  await expect(page.getByTestId('server-css-page-one')).toHaveCSS(
    'background-color',
    'rgb(230, 244, 255)',
  );
  await expect(page.locator('.page-one-child-css')).toHaveCSS(
    'color',
    'rgb(0, 104, 155)',
  );
  await expect(page.getByTestId('server-css-shared-page-one')).toHaveCSS(
    'color',
    'rgb(46, 139, 87)',
  );

  await gotoPage(page, rsbuild.port, 'page2');
  await expectPageShell(page, 'page2');
  await expect(page.getByRole('heading', { name: 'Page 2' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page 1' })).toHaveCount(0);
  await expect(page.getByTestId('server-css-shared-root')).toHaveText(
    'Shared stylesheet from root',
  );
  await expect(page.getByTestId('server-css-shared-page-one')).toHaveCount(0);
  await expect(page.getByTestId('server-css-shared-page-two')).toHaveText(
    'Shared stylesheet from Page 2',
  );
  await expect(page.getByTestId('server-css-shared-root')).toHaveCSS(
    'color',
    'rgb(46, 139, 87)',
  );
  await expect(page.getByTestId('server-css-shared-page-two')).toHaveCSS(
    'color',
    'rgb(46, 139, 87)',
  );
  await expect(page.getByTestId('server-css-page-two')).toHaveCSS(
    'background-color',
    'rgb(255, 240, 230)',
  );
  await expect(page.locator('.page-two-child-css')).toHaveCSS(
    'color',
    'rgb(180, 90, 0)',
  );
});
