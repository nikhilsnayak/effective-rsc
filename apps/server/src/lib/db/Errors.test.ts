import { assert, describe, it } from '@effect/vitest';
import { InternalServerError } from '@repo/contracts/InternalServerError';
import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core';
import { Cause, Effect, Exit, Logger, Option, References, Schema } from 'effect';
import { SqlError } from 'effect/unstable/sql';

import { mapDatabaseFailure } from './Errors.ts';

type LogEntry = {
  readonly message: unknown;
  readonly annotations: Record<string, unknown>;
};

const captureFailure = <E>(error: E) => {
  const logs: Array<LogEntry> = [];
  const logger = Logger.make<unknown, void>((options) => {
    logs.push({
      message: options.message,
      annotations: { ...options.fiber.getRef(References.CurrentLogAnnotations) },
    });
  });

  return Effect.fail(error).pipe(
    mapDatabaseFailure('TodoService.list'),
    Effect.exit,
    Effect.provide(Logger.layer([logger])),
    Effect.map((exit) => ({ exit, logs })),
  );
};

const assertSanitizedDatabaseFailure = (
  exit: Exit.Exit<never, unknown>,
  logs: ReadonlyArray<LogEntry>,
  sensitiveValues: ReadonlyArray<string>,
) => {
  assert(Exit.isFailure(exit));
  const error = Cause.findErrorOption(exit.cause);
  assert(Option.isSome(error));
  assert(Schema.is(InternalServerError)(error.value));
  assert.strictEqual(logs.length, 1);
  assert.deepStrictEqual(logs[0]?.message, ['Database operation failed.']);
  assert.strictEqual(logs[0]?.annotations['operation'], 'TodoService.list');

  const publicAndLogged = JSON.stringify({ error: error.value, logs });
  for (const sensitiveValue of sensitiveValues) {
    assert(!publicAndLogged.includes(sensitiveValue));
  }
};

describe('mapDatabaseFailure', () => {
  it.effect('sanitizes Drizzle query details while retaining stable log annotations', () =>
    Effect.gen(function* () {
      const failure = new EffectDrizzleQueryError({
        query: 'select * from todos where title = $1',
        params: ['private todo title'],
        cause: new Error('database hostname'),
      });
      const { exit, logs } = yield* captureFailure(failure);

      assertSanitizedDatabaseFailure(exit, logs, [
        'select * from todos',
        'private todo title',
        'database hostname',
      ]);
      assert.strictEqual(logs[0]?.annotations['databaseErrorType'], 'EffectDrizzleQueryError');
    }),
  );

  it.effect('sanitizes raw Effect SQL errors', () =>
    Effect.gen(function* () {
      const failure = new SqlError.SqlError({
        reason: new SqlError.UnknownError({
          cause: new Error('private driver detail'),
          message: 'private database message',
          operation: 'driver.query',
        }),
      });
      const { exit, logs } = yield* captureFailure(failure);

      assertSanitizedDatabaseFailure(exit, logs, [
        'private driver detail',
        'private database message',
        'driver.query',
      ]);
      assert.strictEqual(logs[0]?.annotations['databaseErrorType'], 'SqlError');
    }),
  );

  it.effect('leaves non-database failures unchanged', () =>
    Effect.gen(function* () {
      const expected = { _tag: 'ExpectedFailure' as const };
      const { exit, logs } = yield* captureFailure(expected);

      assert(Exit.isFailure(exit));
      const error = Cause.findErrorOption(exit.cause);
      assert(Option.isSome(error));
      assert.strictEqual(error.value, expected);
      assert.deepStrictEqual(logs, []);
    }),
  );
});
