import { Database as SqliteDatabase } from 'bun:sqlite';

import { Context, Effect, Layer } from 'effect';
import { classifySqliteError, SqlError } from 'effect/unstable/sql/SqlError';

export const sqliteError = (cause: unknown) => new SqlError({ reason: classifySqliteError(cause) });

// An absolute path lets deployment tracing discover the fixture passed to bun:sqlite.
const filename = `${process.cwd()}/data/feed.sqlite`;

export class Database extends Context.Service<Database, SqliteDatabase>()(
  '@effective-rsc/example-streaming-feed/Database',
) {
  static readonly layer = Layer.effect(
    this,
    Effect.acquireRelease(
      Effect.try({
        try: () => new SqliteDatabase(filename, { readonly: true }),
        catch: sqliteError,
      }),
      (database) => Effect.sync(() => database.close()),
    ),
  );
}
