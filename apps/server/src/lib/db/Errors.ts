import { InternalServerError } from '@repo/contracts/InternalServerError';
import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core';
import { Effect, Metric, Schema } from 'effect';
import { SqlError } from 'effect/unstable/sql';

type DatabaseFailure = EffectDrizzleQueryError | SqlError.SqlError;

const isEffectDrizzleQueryError = Schema.is(EffectDrizzleQueryError);
const isDatabaseFailure = <E>(error: E): error is Extract<E, DatabaseFailure> =>
  isEffectDrizzleQueryError(error) || SqlError.isSqlError(error);
const databaseFailures = Metric.counter('app_database_failures_total', {
  description: 'Database operation failures.',
  incremental: true,
});

export const mapDatabaseFailure = (operation: string) =>
  function map<A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, Exclude<E, Extract<E, DatabaseFailure>> | InternalServerError, R> {
    return effect.pipe(
      Effect.catchIf(
        isDatabaseFailure,
        (error) =>
          Metric.update(databaseFailures.pipe(Metric.withAttributes({ operation })), 1).pipe(
            Effect.andThen(
              Effect.logError('Database operation failed.').pipe(
                Effect.annotateLogs({
                  operation,
                  databaseErrorType: error._tag,
                }),
              ),
            ),
            Effect.andThen(Effect.fail(new InternalServerError({}))),
          ),
        Effect.fail,
      ),
    );
  };
