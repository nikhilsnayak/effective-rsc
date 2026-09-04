import { defineConfig } from '@rstest/core';

// https://playwright.dev/docs/service-workers-experimental
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export default defineConfig({
  env: {
    // Let Rsbuild choose the mode based on the command.
    NODE_ENV: undefined,
  },
  isolate: false,
  // Retry on CI
  retry: process.env.CI ? 3 : 0,
  pool: {
    maxWorkers: 1,
  },
});
