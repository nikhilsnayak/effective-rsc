// oxlint-disable effecttsgo/async-function, effecttsgo/node-builtin-import, effecttsgo/global-timers -- Playwright owns the test server and its Promise-based lifecycle.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { expect, test as base } from '@playwright/test';

const applicationDirectory = fileURLToPath(new URL('../../', import.meta.url));

export const test = base.extend({
  baseURL: [
    async ({ playwright }, use, testInfo) => {
      const port = testInfo.project.name === 'dev' ? '18205' : '18204';
      const origin = `http://localhost:${port}`;
      const probe = await playwright.request.newContext({ baseURL: origin });
      const occupied = await probe.get('/', { timeout: 1_000 }).then(
        () => true,
        () => false,
      );
      if (occupied) {
        await probe.dispose();
        throw new Error(`The test requires an unused application port: ${port}`);
      }
      // A fresh process owns a fresh in-memory database for every journey, including retries.
      const server = spawn('bun', ['run', testInfo.project.name], {
        cwd: applicationDirectory,
        detached: true,
        env: { ...process.env, EVENT_PLATFORM_DATABASE_FILENAME: ':memory:', PORT: port },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let startupError: Error | undefined;
      server.stdout.on('data', (chunk) => {
        output += String(chunk);
      });
      server.stderr.on('data', (chunk) => {
        output += String(chunk);
      });
      server.on('error', (error) => {
        startupError = error;
      });
      const closed = once(server, 'close').catch((error: Error) => {
        startupError = error;
      });
      const stop = (signal: NodeJS.Signals) => {
        if (server.pid !== undefined) {
          try {
            process.kill(-server.pid, signal);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
              throw error;
            }
          }
        }
      };

      try {
        await expect
          .poll(
            async () => {
              if (startupError !== undefined) {
                throw startupError;
              }
              if (server.exitCode !== null || server.signalCode !== null) {
                const reason = server.signalCode ?? `exit code ${server.exitCode}`;
                throw new Error(`Application exited before readiness (${reason}): ${output}`);
              }
              try {
                const response = await probe.get('/', { timeout: 1_000 });
                return response.status();
              } catch {
                return 0;
              }
            },
            { timeout: 30_000, message: 'The isolated application must be ready' },
          )
          .toBe(200);
        await use(origin);
      } finally {
        stop('SIGINT');
        const forceStop = setTimeout(() => stop('SIGKILL'), 5_000);
        try {
          await closed;
        } finally {
          clearTimeout(forceStop);
          await probe.dispose();
        }
        if (testInfo.status !== testInfo.expectedStatus) {
          await testInfo.attach('application.log', { body: output, contentType: 'text/plain' });
        }
      }
    },
    { scope: 'test', timeout: 45_000 },
  ],
});

export { expect } from '@playwright/test';
