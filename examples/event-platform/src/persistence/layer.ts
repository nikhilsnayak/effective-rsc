import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import { SqliteClient } from '@effect/sql-sqlite-bun';
import { Config, Effect, FileSystem, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import { runMigrations } from '@/persistence/Migrations';

const databaseDirectory = '.data';
const databaseFilename = `${databaseDirectory}/event-platform.sqlite`;
const DatabaseFilename = Config.string('EVENT_PLATFORM_DATABASE_FILENAME').pipe(
  Config.withDefault(databaseFilename),
);

const SqliteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const filename = yield* DatabaseFilename;
    yield* fileSystem.makeDirectory(databaseDirectory, { recursive: true });

    return SqliteClient.layer({ filename });
  }),
).pipe(Layer.provide(BunFileSystem.layer));

const setup = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    yield* sql`PRAGMA journal_mode = WAL`;
    yield* sql`PRAGMA busy_timeout = 5000`;
    yield* sql`PRAGMA foreign_keys = ON`;
    yield* runMigrations;
  }),
);

export const PersistenceLayer = setup.pipe(Layer.provideMerge(SqliteLayer));
