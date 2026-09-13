// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based application-test boundary.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

type FeedCounters = {
  readonly interrupted: number;
  readonly log: ReadonlyArray<string>;
  readonly started: number;
};

const counters = async (request: APIRequestContext): Promise<FeedCounters> => {
  const response = await request.get('/test/feed');
  expect(response.status()).toBe(200);
  return (await response.json()) as FeedCounters;
};

const searchFor = async (page: Page, term: string) => {
  await page.getByTestId('feed-term').fill(term);
};

test('seeds the first page from the server render, without a browser request', async ({
  page,
  request,
}) => {
  const before = await counters(request);
  const queries: Array<string> = [];
  page.on('request', (browserRequest) => {
    if (new URL(browserRequest.url()).pathname === '/_ersc/query') {
      queries.push(browserRequest.method());
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('feed-status')).toHaveText('ready');
  await expect(page.getByTestId('feed-entry')).toHaveCount(6);
  await expect(page.getByTestId('feed-entry').first()).toHaveText('Feed entry 1');

  const after = await counters(request);
  expect(after.started).toBe(before.started + 1);
  expect(after.log.at(-1)).toBe('<empty>@0:ok');
  expect(queries).toEqual([]);
});

test('reads a Server Function over QUERY in the framework namespace', async ({ page }) => {
  const queries: Array<string> = [];
  page.on('request', (browserRequest) => {
    if (new URL(browserRequest.url()).pathname === '/_ersc/query') {
      queries.push(browserRequest.method());
    }
  });

  await page.goto('/');
  await searchFor(page, 'entry 21');

  await expect(page.getByTestId('feed-status')).toHaveText('ready');
  await expect(page.getByTestId('feed-entry')).toHaveCount(1);
  await expect(page.getByTestId('feed-entry')).toHaveText('Feed entry 21');
  expect(queries).toEqual(['QUERY']);
});

test('interrupts a superseded query on the server', async ({ page, request }) => {
  await page.goto('/');
  const before = await counters(request);

  await searchFor(page, 'entry 2');
  await expect(page.getByTestId('feed-status')).toHaveText('waiting');
  await searchFor(page, 'entry 20');
  await expect(page.getByTestId('feed-status')).toHaveText('waiting');
  await searchFor(page, 'entry 21');
  await expect(page.getByTestId('feed-status')).toHaveText('ready');

  await expect
    .poll(async () => (await counters(request)).log.slice(before.log.length))
    .toEqual(['entry 2@0:interrupted', 'entry 20@0:interrupted', 'entry 21@0:ok']);

  const after = await counters(request);
  expect(after.started).toBe(before.started + 3);
  expect(after.interrupted).toBe(before.interrupted + 2);
});

test('interrupts an in-flight query on demand', async ({ page, request }) => {
  await page.goto('/');
  const before = await counters(request);

  await searchFor(page, 'entry');
  await expect(page.getByTestId('feed-status')).toHaveText('waiting');
  await page.getByTestId('feed-cancel').click();

  await expect(page.getByTestId('feed-status')).toHaveText('interrupted');
  await expect
    .poll(async () => (await counters(request)).log.slice(before.log.length))
    .toEqual(['entry@0:interrupted']);
  expect((await counters(request)).interrupted).toBe(before.interrupted + 1);
});

test('continues the seeded page from the browser', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('feed-entry').first()).toHaveText('Feed entry 1');

  await page.getByTestId('feed-next').click();

  await expect(page.getByTestId('feed-status')).toHaveText('ready');
  await expect(page.getByTestId('feed-entry').first()).toHaveText('Feed entry 7');
  await expect(page.getByTestId('feed-entry')).toHaveCount(6);
});

test('routes the framework query path for QUERY only', async ({ request }) => {
  const [post, get] = await Promise.all([
    request.post('/_ersc/query', { data: 'x' }),
    request.get('/_ersc/query'),
  ]);

  expect(post.status()).toBe(404);
  expect(get.status()).toBe(404);
});

test('renders an Effectful Server Component from a query, with its middleware scope', async ({
  context,
  page,
}) => {
  await context.addCookies([{ name: 'fixture-actor', url: 'http://localhost', value: 'Ada' }]);
  await page.goto('/');

  await page.getByTestId('feed-describe').click();

  await expect(page.getByTestId('feed-actor')).toContainText('Ada');
  await expect(page.getByTestId('feed-actor')).toContainText('queries');
});
