// oxlint-disable effecttsgo/async-function -- Playwright owns the test and its query cleanup.
import { expect, test as base } from '@playwright/test';

type HeldQuery = {
  readonly waitUntilStarted: () => Promise<void>;
  readonly waitUntilCancelled: () => Promise<void>;
  readonly release: () => Promise<void>;
};

export const test = base.extend<{
  holdQuery: (
    name: 'catalog-primary' | 'catalog-secondary' | 'detail-secondary-slow-stream',
  ) => Promise<HeldQuery>;
}>({
  holdQuery: async ({ request }, use) => {
    const held = new Set<string>();
    const release = async (path: string) => {
      const response = await request.delete(path);
      expect(response.status()).toBe(204);
      held.delete(path);
    };
    try {
      await use(async (name) => {
        const path = `/test/queries/${name}`;
        held.add(path);
        const response = await request.post(path);
        expect(response.status()).toBe(204);
        const waiting = async () => {
          const status = await request.get(path);
          expect(status.status()).toBe(200);
          return (await status.json()).waiting as number;
        };
        return {
          waitUntilStarted: async () => {
            await expect.poll(waiting).toBeGreaterThan(0);
          },
          waitUntilCancelled: async () => {
            await expect.poll(waiting).toBe(0);
          },
          release: () => release(path),
        };
      });
    } finally {
      await Promise.all([...held].map(release));
    }
  },
});
