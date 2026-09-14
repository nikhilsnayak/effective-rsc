import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  expect: { timeout: 15_000 },
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: [
    { name: 'start', use: { baseURL: 'http://localhost:18221' } },
    { name: 'dev', use: { baseURL: 'http://localhost:18222' } },
  ],
  webServer: [
    {
      command: 'bun run start --port 18221',
      url: 'http://localhost:18221',
      env: { STREAMING_FEED_DELAY_MS: '350', STREAMING_FEED_DETAIL_DELAY_MS: '1800' },
      reuseExistingServer: false,
    },
    {
      command: 'ersc dev --port 18222',
      url: 'http://localhost:18222',
      env: { STREAMING_FEED_DELAY_MS: '350', STREAMING_FEED_DETAIL_DELAY_MS: '1800' },
      reuseExistingServer: false,
    },
  ],
});
