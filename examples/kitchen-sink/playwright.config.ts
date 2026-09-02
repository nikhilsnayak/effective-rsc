import { defineConfig, devices } from '@playwright/test';

const startOrigin = 'http://localhost:18194';
const startReadyUrl = `${startOrigin}/_ersc/assets/main.js`;
const developmentOrigin = 'http://localhost:18195';
export default defineConfig({
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
      env: { PORT: '18194' },
      name: 'start',
      url: startReadyUrl,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: {
        signal: 'SIGINT',
        timeout: 5_000,
      },
    },
    {
      command: 'ersc dev',
      env: { PORT: '18195' },
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
