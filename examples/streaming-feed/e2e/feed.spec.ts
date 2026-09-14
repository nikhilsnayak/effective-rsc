// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

test('seeds server-rendered cards without a hydration query, including without JavaScript', async ({
  page,
  browser,
  baseURL,
}) => {
  const queries: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'QUERY') {
      queries.push(request.url());
    }
  });
  await page.goto('/');
  await expect(page.locator('[data-story-id]')).toHaveCount(6);
  await page.locator('[data-story-id="1"]').getByRole('button', { name: 'Read the note' }).click();
  await expect(page.getByText('A loose edge invites a question.', { exact: false })).toBeVisible();
  expect(queries).toEqual([]);
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const document = await context.newPage();
    await document.goto(baseURL!);
    await expect(document.locator('[data-story-id]')).toHaveCount(6);
    await expect(
      document.getByRole('heading', { name: 'Leave a little room for the unexpected' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('streams successive pages incrementally and retains client state without duplicate requests', async ({
  page,
}) => {
  const errors: string[] = [];
  const queries: string[] = [];
  let documents = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'QUERY') {
      queries.push(request.postData()!);
    }
    if (request.isNavigationRequest() && request.method() === 'GET') {
      documents++;
    }
  });
  await page.goto('/');
  await page.locator('[data-story-id="1"]').getByRole('button').click();
  await page.getByRole('status').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-story-id="7"]')).toBeAttached();
  expect(await page.locator('[data-story-id]').count()).toBeLessThan(12);
  await page.locator('[data-story-id="7"]').getByRole('button').click();
  const note = page.locator('[data-story-id="7"] .story-detail-body');
  await expect(note).toHaveText('Loading the note…');
  await expect(page.locator('[data-story-id="8"]')).toBeAttached();
  await expect(note).toHaveText('Loading the note…');
  await expect(page.locator('[data-story-id]')).toHaveCount(12);
  const lastCard = page.locator('[data-story-id="12"]');
  await lastCard.getByRole('button', { name: 'Read the note' }).click();
  await expect(lastCard.locator('.story-note-loading')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Loading more notes…');
  await expect(lastCard.locator('.story-note-loading')).toHaveCount(0);
  await expect(lastCard.locator('.story-detail-body p')).not.toBeEmpty();
  await expect(page.getByRole('status')).toHaveText('Scroll for more');
  await expect(note).not.toHaveText('Loading the note…');
  await expect(note.locator('p')).not.toBeEmpty();
  await expect(page.locator('[data-story-id="1"]').getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.locator('[data-story-id="7"]').getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('status').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('[data-story-id]').count()).toBeGreaterThanOrEqual(18);
  const ids = await page
    .locator('[data-story-id]')
    .evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('data-story-id'))));
  expect(ids).toEqual(Array.from({ length: ids.length }, (_, index) => index + 1));
  expect(queries.length).toBeGreaterThanOrEqual(2);
  expect(queries).toEqual(
    Array.from({ length: queries.length }, (_, index) =>
      JSON.stringify([{ after: (index + 1) * 6 }]),
    ),
  );
  expect(documents).toBe(1);
  expect(errors).toEqual([]);
});

test('retries transport failure without reloading or losing cards and resumes infinite scroll', async ({
  page,
}) => {
  let documents = 0;
  let queries = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.method() === 'GET') {
      documents++;
    }
    if (request.method() === 'QUERY') {
      queries++;
    }
  });
  await page.goto('/');
  await page.locator('[data-story-id="1"]').getByRole('button').click();
  await page.route('**/_ersc/query', (route) => route.abort(), { times: 1 });
  await page.getByRole('status').scrollIntoViewIfNeeded();
  await expect(page.getByRole('alert')).toContainText('couldn’t be loaded');
  await expect(page.locator('[data-story-id]')).toHaveCount(6);
  expect(queries).toBe(1);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retrying…' })).toBeDisabled();
  await expect(page.locator('[data-story-id]')).toHaveCount(12);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[data-story-id="1"]').getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('status').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-story-id]')).toHaveCount(18);
  const ids = await page
    .locator('[data-story-id]')
    .evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('data-story-id'))));
  expect(ids).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
  expect(documents).toBe(1);
  expect(queries).toBe(3);
});

for (const lastCard of [7, 12]) {
  test(`leaving after card ${lastCard} aborts pending notes and retains received cards`, async ({
    page,
  }) => {
    await page.goto('/');
    const query = page.waitForRequest((request) => request.method() === 'QUERY');
    await page.getByRole('status').scrollIntoViewIfNeeded();
    const request = await query;
    await expect(page.locator(`[data-story-id="${lastCard}"]`)).toBeAttached();
    const aborted = page.waitForEvent('requestfailed', {
      predicate: (failed) => failed === request,
    });
    await page.getByRole('link', { name: 'about', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'about this feed.' })).toBeVisible();
    expect((await aborted).failure()?.errorText).toContain('ERR_ABORTED');
    await page.waitForTimeout(600);
    await page.getByRole('link', { name: 'Back to the notes', exact: false }).click();
    await expect(page.locator('[data-story-id="7"]')).toBeAttached();
    await expect(page.locator('[data-story-id="1"]')).toBeAttached();
    await expect(page.getByRole('alert')).toHaveCount(0);
    const retained = await page.locator('[data-story-id]').count();
    const interrupted = page.locator(`[data-story-id="${lastCard}"]`);
    await interrupted.getByRole('button', { name: 'Read the note' }).click();
    await expect(interrupted.locator('.story-note-error')).toContainText('couldn’t be loaded');
    await expect(interrupted.getByRole('button', { name: 'Reload the feed' })).toBeVisible();
    await page.getByRole('status').scrollIntoViewIfNeeded();
    await expect
      .poll(() => page.locator('[data-story-id]').count())
      .toBeGreaterThanOrEqual(retained + 6);
    const ids = await page
      .locator('[data-story-id]')
      .evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('data-story-id'))));
    expect(ids).toEqual(Array.from({ length: ids.length }, (_, index) => index + 1));
  });
}
