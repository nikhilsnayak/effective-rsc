// oxlint-disable effecttsgo/async-function -- Playwright helpers compose its Promise-based browser API.
import type { Page } from '@playwright/test';

export const sessionCard = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: title });

export const setAgendaSelection = async (page: Page, title: string, selected: boolean) => {
  const session = sessionCard(page, title);
  const add = session.getByRole('button', { name: 'Add to your agenda' });
  const remove = session.getByRole('button', { name: 'Remove from your agenda' });
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
