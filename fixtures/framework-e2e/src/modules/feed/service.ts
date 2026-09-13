import { Cause, Context, Effect, Exit, Layer } from 'effect';

import type { FeedEntry, FeedPage } from '@/modules/feed/model';

const Categories = ['Data', 'Navigation', 'Rendering'] as const;
const PageSize = 6;

const entries: ReadonlyArray<FeedEntry> = Array.from({ length: 42 }, (_, index) => ({
  category: Categories[index % Categories.length]!,
  id: `feed-${index + 1}`,
  title: `Feed entry ${index + 1}`,
}));

export type FeedSearch = {
  readonly cursor: number | null;
  readonly latencyMillis: number;
  readonly term: string;
};

export class FeedService extends Context.Service<FeedService>()(
  '@effective-rsc/framework-e2e/feed/FeedService',
  {
    make: Effect.sync(() => {
      let interrupted = 0;
      let started = 0;
      const log: Array<string> = [];

      return {
        counters: Effect.sync(() => ({ interrupted, log: [...log], started })),
        search: Effect.fnUntraced(function* ({ cursor, latencyMillis, term }: FeedSearch) {
          started += 1;
          yield* Effect.sleep(`${latencyMillis} millis`).pipe(
            Effect.onExit((exit) =>
              Effect.sync(() => {
                const outcome =
                  Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause) ? 'interrupted' : 'ok';
                if (outcome === 'interrupted') {
                  interrupted += 1;
                }
                log.push(`${term || '<empty>'}@${cursor ?? 0}:${outcome}`);
              }),
            ),
          );

          const normalized = term.trim().toLowerCase();
          const matches =
            normalized === ''
              ? entries
              : entries.filter((entry) => entry.title.toLowerCase().includes(normalized));
          const offset = cursor ?? 0;
          const page = matches.slice(offset, offset + PageSize);
          const nextOffset = offset + page.length;

          return {
            entries: page,
            nextCursor: nextOffset < matches.length ? nextOffset : null,
            total: matches.length,
          } satisfies FeedPage;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
