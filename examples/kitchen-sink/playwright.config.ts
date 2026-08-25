import { defineConfig, devices } from '@playwright/test';

const applicationOrigin = 'http://localhost:18193';
const applicationReadyUrl = `${applicationOrigin}/_ersc/assets/main.js`;
// oxlint-disable-next-line effecttsgo/process-env -- Playwright configuration reads the CI process boundary.
const isCi = process.env['CI'] !== undefined;

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
    url: applicationReadyUrl,
    reuseExistingServer: !isCi,
    timeout: 30_000,
    gracefulShutdown: {
      signal: 'SIGINT',
      timeout: 5_000,
    },
  },
});
