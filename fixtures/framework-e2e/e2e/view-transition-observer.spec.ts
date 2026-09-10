// oxlint-disable effecttsgo/async-function -- Playwright owns this Promise-based browser-test boundary.
import { expect, test } from '@playwright/test';

import { expectViewTransition, observeViewTransitions } from './support/view-transitions';

test.beforeEach(async ({ page }) => {
  await observeViewTransitions(page);
  await page.goto('about:blank');
  await expectViewTransition(page, ['probe'], () =>
    page.evaluate(
      () =>
        document.startViewTransition({
          types: ['probe'],
          update: () => {
            document.body.textContent = 'First action';
          },
        }).finished,
    ),
  );
});

test('an earlier transition cannot satisfy an action that starts no transition', async ({
  page,
}) => {
  await expect(
    expectViewTransition(page, ['probe'], () =>
      page.evaluate(() => {
        document.body.textContent = 'Action without a transition';
      }),
    ),
  ).rejects.toThrow();
});

test('an earlier transition cannot hide a rejected transition from the next action', async ({
  page,
}) => {
  await expect(
    expectViewTransition(page, ['probe'], () =>
      page.evaluate(() => {
        const transition = document.startViewTransition({
          types: ['probe'],
          update: () => Promise.reject(new Error('Transition update failed')),
        });
        void transition.ready.catch(() => {});
        return transition.finished.catch(() => {});
      }),
    ),
  ).rejects.toThrow();
});
