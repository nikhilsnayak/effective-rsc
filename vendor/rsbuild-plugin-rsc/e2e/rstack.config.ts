// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

// https://playwright.dev/docs/service-workers-experimental
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

define.test({
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
