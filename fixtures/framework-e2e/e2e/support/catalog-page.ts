// oxlint-disable effecttsgo/async-function -- Playwright helpers compose its Promise-based browser API.
import type { Page } from '@playwright/test';

export const itemCard = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: title });

export const setItemSelection = async (page: Page, title: string, selected: boolean) => {
  const item = itemCard(page, title);
  const add = item.getByRole('button', { name: 'Add to the selection' });
  const remove = item.getByRole('button', { name: 'Remove from the selection' });
  await add.or(remove).first().waitFor();

  if (selected) {
    if (await add.isVisible()) {
      await add.click();
      await remove.waitFor();
    }
  } else if (await remove.isVisible()) {
    await remove.click();
    await add.waitFor();
  }
};
