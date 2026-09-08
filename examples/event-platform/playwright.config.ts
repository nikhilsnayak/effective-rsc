import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: {
    timeout: 15_000,
  },
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'start',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'dev',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
