import { Cause, Config, Context, Effect, Layer, Random, Schema, Stream } from 'effect';

import { Database, sqliteError } from './database';
import { PageSize } from './model';

const Story = Schema.Struct({
  id: Schema.Natural,
  title: Schema.String,
  category: Schema.String,
  author: Schema.String,
  summary: Schema.String,
});
export type Story = typeof Story.Type;

const decodeStory = Schema.decodeUnknownEffect(Story);
const decodeDetail = Schema.decodeUnknownEffect(Schema.Struct({ detail: Schema.String }));

export class FeedService extends Context.Service<FeedService>()(
  '@effective-rsc/example-streaming-feed/FeedService',
  {
    make: Effect.gen(function* () {
      const database = yield* Database;
      const fixedDelay = yield* Config.Number('STREAMING_FEED_DELAY_MS').pipe(
        Config.withDefault(-1),
      );
      const detailDelay = yield* Config.Number('STREAMING_FEED_DETAIL_DELAY_MS').pipe(
        Config.withDefault(-1),
      );
      const count = yield* Effect.try({
        try: () => database.query('SELECT COUNT(*) AS total FROM stories').get(),
        catch: sqliteError,
      }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ total: Schema.Natural }))));
      const read = Effect.fnUntraced(function* (after: number) {
        const statement = yield* Effect.acquireRelease(
          Effect.try({
            try: () =>
              database.prepare(`
              SELECT id, title, category, author, summary
              FROM stories WHERE id > ? ORDER BY id LIMIT ?
            `),
            catch: sqliteError,
          }),
          (statement) => Effect.sync(() => statement.finalize()),
        );
        const rows = yield* Effect.try({
          try: () => statement.iterate(after, PageSize),
          catch: sqliteError,
        });
        return Stream.fromEffectRepeat(
          Effect.gen(function* () {
            const next = yield* Effect.try({ try: () => rows.next(), catch: sqliteError });
            if (next.done) {
              return yield* Cause.done();
            }
            return yield* decodeStory(next.value);
          }),
        );
      });
      const page = (after: number) => Stream.runCollect(Stream.unwrap(read(after)));
      const stream = (after: number) =>
        Stream.unwrap(read(after)).pipe(
          Stream.mapEffect(
            Effect.fnUntraced(function* (entry) {
              const delay = yield* fixedDelay < 0
                ? Random.nextIntBetween(1000, 3000)
                : Effect.succeed(fixedDelay);
              yield* Effect.sleep(delay);
              return entry;
            }),
          ),
        );
      const detail = Effect.fn('FeedService.detail')(function* (id: number) {
        const delay = yield* detailDelay < 0
          ? Random.nextIntBetween(2000, 4000)
          : Effect.succeed(detailDelay);
        yield* Effect.sleep(delay);
        const row = yield* Effect.try({
          try: () => database.query('SELECT detail FROM stories WHERE id = ?').get(id),
          catch: sqliteError,
        });
        if (row === null) {
          return null;
        }
        const decoded = yield* decodeDetail(row);
        return decoded.detail;
      });
      return { page, stream, detail, total: count.total };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
