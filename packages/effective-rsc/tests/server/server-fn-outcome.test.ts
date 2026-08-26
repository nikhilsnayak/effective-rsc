import { describe, expect, it } from '@effect/vitest';
import { Cause, Effect } from 'effect';

import { serverFnOutcome } from '../../src/server/server-fn-outcome';

describe('serverFnOutcome', () => {
  it.effect('preserves interruption instead of converting it to a 500 result', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(serverFnOutcome(Effect.interrupt));

      expect(exit._tag).toBe('Failure');
      if (exit._tag === 'Failure') {
        expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      }
    }),
  );

  it.effect('returns completed success and failure outcomes through successful Flight', () =>
    Effect.gen(function* () {
      const success = yield* serverFnOutcome(Effect.succeed('saved'));
      const failure = yield* serverFnOutcome(Effect.fail('unavailable'));

      expect(success).toEqual({
        serverFnResult: { _tag: 'Success', value: 'saved' },
        status: 200,
      });
      expect(failure).toEqual({
        serverFnResult: { _tag: 'Failure', error: 'unavailable' },
        status: 200,
      });
    }),
  );
});
