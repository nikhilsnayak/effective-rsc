import { expect, it } from '@effect/vitest';
import { ConfigProvider, Effect, Layer, Stream } from 'effect';
import { vi } from 'vitest';

import { Database } from '../src/database';
import { FeedService } from '../src/service';

const layer = FeedService.layer.pipe(
  Layer.provideMerge(Database.layer),
  Layer.provide(
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ STREAMING_FEED_DELAY_MS: 0, STREAMING_FEED_DETAIL_DELAY_MS: 0 }),
    ),
  ),
);

it.effect('reads bounded pages from the read-only fixture through its primary key', () =>
  Effect.gen(function* () {
    const feed = yield* FeedService;
    const database = yield* Database;
    expect(feed.total).toBe(10_000);
    for (const [after, ids] of [
      [0, [1, 2, 3, 4, 5, 6]],
      [9000, [9001, 9002, 9003, 9004, 9005, 9006]],
      [9996, [9997, 9998, 9999, 10_000]],
      [10_000, []],
    ] as const) {
      const page = yield* feed.page(after);
      expect(page.map((story) => story.id)).toEqual(ids);
      for (const story of page) {
        expect(story).not.toHaveProperty('detail');
      }
    }
    const plan = database
      .query('EXPLAIN QUERY PLAN SELECT * FROM stories WHERE id > ? ORDER BY id LIMIT 6')
      .get(9000);
    expect(plan).toMatchObject({ detail: expect.stringContaining('USING INTEGER PRIMARY KEY') });
    expect(() => database.run('DELETE FROM stories WHERE id = -1')).toThrow();
  }).pipe(Effect.provide(layer)),
);

it.effect('loads note details separately and handles a missing story', () =>
  Effect.gen(function* () {
    const feed = yield* FeedService;
    const detail = yield* feed.detail(1);
    const missing = yield* feed.detail(10_001);
    expect(detail).toContain('A loose edge invites a question.');
    expect(missing).toBeNull();
  }).pipe(Effect.provide(layer)),
);

it.effect('keeps row iterators independent and finalizes them when consumption stops early', () =>
  Effect.gen(function* () {
    const feed = yield* FeedService;
    const database = yield* Database;
    const prepare = vi.spyOn(database, 'prepare');
    try {
      const first = feed.stream(9000);
      const second = feed.stream(9000);
      expect(prepare).not.toHaveBeenCalled();
      const finalized = yield* Effect.scoped(
        Effect.gen(function* () {
          const pullFirst = yield* Stream.toPull(first);
          const pullSecond = yield* Stream.toPull(second);
          const firstRow = yield* pullFirst;
          const secondRow = yield* pullSecond;
          const nextFirstRow = yield* pullFirst;
          expect(firstRow.map((story) => story.id)).toEqual([9001]);
          expect(secondRow.map((story) => story.id)).toEqual([9001]);
          expect(nextFirstRow.map((story) => story.id)).toEqual([9002]);
          expect(prepare).toHaveBeenCalledTimes(2);
          return prepare.mock.results.map((result) => vi.spyOn(result.value, 'finalize'));
        }),
      );
      for (const finalize of finalized) {
        expect(finalize).toHaveBeenCalledTimes(1);
      }
    } finally {
      vi.restoreAllMocks();
    }
  }).pipe(Effect.provide(layer)),
);
