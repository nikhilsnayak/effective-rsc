import { defineConfig, devices } from '@playwright/test';

const applicationOrigin = 'http://localhost:18193';
const applicationReadyUrl = `${applicationOrigin}/_ersc/assets/main.js`;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: applicationOrigin,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
  webServer: {
    command: 'ersc start',
    env: { CONFERENCE_DATABASE_PATH: ':memory:' },
    url: applicationReadyUrl,
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: {
      signal: 'SIGINT',
      timeout: 5_000,
    },
  },
});
