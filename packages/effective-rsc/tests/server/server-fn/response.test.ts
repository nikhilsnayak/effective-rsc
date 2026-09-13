import { describe, expect, it } from '@effect/vitest';
import { Cause, Effect, Schema } from 'effect';
import { vi } from 'vitest';

import { Application } from '../../../src/application/ersc';
import { type ERSCIdentity, getERSCIdentity } from '../../../src/application/ersc-identity';
import { matchServerFnInvocation } from '../../../src/application/server-fn';
import { ServerFnInputError } from '../../../src/rsc/server-fn-error';
import { serverFnResponse } from '../../../src/server/server-fn/response';

const respond = <Output, Services>(
  invocation: Promise<Output>,
  identity: ERSCIdentity<Services>,
) => {
  const match = matchServerFnInvocation(invocation, identity);
  if (match._tag !== 'Match') {
    return Effect.die('Expected an ERSC ServerFn invocation.');
  }

  return serverFnResponse(match.effect);
};

const failing = () => {
  const ERSC = Application.ersc();
  const loadFeed = ERSC.ServerFn.make({
    input: Schema.String,
    handler: () => Effect.die(new RangeError('connection string leaked')),
  });

  return respond(loadFeed('news'), getERSCIdentity(loadFeed));
};

describe('serverFnResponse', () => {
  it.effect('preserves interruption instead of encoding it as a completed result', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(serverFnResponse(Effect.interrupt));

      expect(exit._tag).toBe('Failure');
      if (exit._tag === 'Failure') {
        expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      }
    }),
  );

  it.effect('hands the success value to Flight without schema encoding', () =>
    Effect.gen(function* () {
      const value = { nested: { items: [1, 2] }, when: 'later' };
      const result = yield* serverFnResponse(Effect.succeed(value));

      expect(result).toEqual({ _tag: 'Success', value });
      if (result._tag === 'Success') {
        expect(result.value).toBe(value);
      }
    }),
  );

  it.effect('withholds failure detail outside development', () =>
    Effect.gen(function* () {
      vi.stubEnv('NODE_ENV', 'production');
      const result = yield* failing();

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure' && result.error._tag === 'ServerFnDefect') {
        expect(result.error.detail).toBeNull();
        expect(result.error.digest).toEqual(expect.any(String));
      } else {
        expect.unreachable('Expected a ServerFnDefect.');
      }
      vi.unstubAllEnvs();
    }),
  );

  it.effect('reports failure detail in development', () =>
    Effect.gen(function* () {
      vi.stubEnv('NODE_ENV', 'development');
      const result = yield* failing();

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure' && result.error._tag === 'ServerFnDefect') {
        expect(result.error.detail?.name).toBe('RangeError');
        expect(result.error.detail?.message).toBe('connection string leaked');
        expect(result.error.detail?.stack).toEqual(expect.any(String));
        expect(result.error.digest).toEqual(expect.any(String));
      } else {
        expect.unreachable('Expected a ServerFnDefect.');
      }
      vi.unstubAllEnvs();
    }),
  );

  it.effect('gives every failure its own digest', () =>
    Effect.gen(function* () {
      const first = yield* failing();
      const second = yield* failing();

      if (
        first._tag === 'Failure' &&
        first.error._tag === 'ServerFnDefect' &&
        second._tag === 'Failure' &&
        second.error._tag === 'ServerFnDefect'
      ) {
        expect(first.error.digest).not.toBe(second.error.digest);
      } else {
        expect.unreachable('Expected two ServerFnDefect results.');
      }
    }),
  );

  it.effect('separates a rejected argument from a server defect', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc();
      const loadFeed = ERSC.ServerFn.make({
        input: Schema.NonEmptyString,
        handler: () => Effect.succeed('unused'),
      });

      const result = yield* respond(loadFeed(''), getERSCIdentity(loadFeed));

      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.error._tag).toBe('ServerFnInputError');
        expect(result.error.detail?.message).toEqual(expect.any(String));
        expect(result.error.detail).not.toHaveProperty('stack');
      }
    }),
  );

  it.effect('withholds input-error stacks while preserving validation details', () =>
    Effect.gen(function* () {
      const detail = {
        message: 'Expected a string',
        name: 'SchemaError',
        stack: '/internal/server.ts:42',
      };
      for (const environment of ['production', 'development']) {
        vi.stubEnv('NODE_ENV', environment);
        try {
          const result = yield* serverFnResponse(Effect.fail(new ServerFnInputError({ detail })));

          expect(result).toEqual({
            _tag: 'Failure',
            error: {
              _tag: 'ServerFnInputError',
              detail: { message: 'Expected a string', name: 'SchemaError' },
            },
          });
        } finally {
          vi.unstubAllEnvs();
        }
      }
    }),
  );

  it.effect('describes a rejected argument outside development too', () =>
    Effect.gen(function* () {
      vi.stubEnv('NODE_ENV', 'production');
      const ERSC = Application.ersc();
      const loadFeed = ERSC.ServerFn.make({
        input: Schema.NonEmptyString,
        handler: () => Effect.succeed('unused'),
      });

      const result = yield* respond(loadFeed(''), getERSCIdentity(loadFeed));

      expect(result._tag === 'Failure' && result.error.detail !== null).toBe(true);
      vi.unstubAllEnvs();
    }),
  );
});
