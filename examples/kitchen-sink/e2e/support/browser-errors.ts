import type { Page } from '@playwright/test';

export const observeBrowserErrors = (page: Page) => {
  const errors: Array<string> = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  return errors;
};
