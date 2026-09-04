import { defineConfig, devices } from '@playwright/test';

const startOrigin = 'http://localhost:18204';
const developmentOrigin = 'http://localhost:18205';
const isolatedDatabase = { EVENT_PLATFORM_DATABASE_FILENAME: ':memory:' };

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
        baseURL: startOrigin,
      },
    },
    {
      name: 'dev',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: developmentOrigin,
      },
    },
  ],
  webServer: [
    {
      command: 'ersc start',
      env: { ...isolatedDatabase, PORT: '18204' },
      name: 'start',
      url: startOrigin,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: {
        signal: 'SIGINT',
        timeout: 5_000,
      },
    },
    {
      command: 'ersc dev',
      env: { ...isolatedDatabase, PORT: '18205' },
      name: 'dev',
      url: developmentOrigin,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: {
        signal: 'SIGINT',
        timeout: 5_000,
      },
    },
  ],
});
