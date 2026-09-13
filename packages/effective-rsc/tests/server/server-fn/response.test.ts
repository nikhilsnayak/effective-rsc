import { describe, expect, it } from '@effect/vitest';
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Scope, Stream } from 'effect';
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

  it.effect('hands a returned Stream to Flight as a ReadableStream', () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const parentScope = yield* Effect.scope;
      const requestScope = yield* Scope.fork(parentScope);
      yield* Effect.addFinalizer(() => Effect.sync(() => events.push('request released'))).pipe(
        Scope.provide(requestScope),
      );
      const ERSC = Application.ersc();
      const readTicks = ERSC.ServerFn.make({
        input: Schema.Void,
        handler: () =>
          Effect.succeed(
            Stream.make('one', 'two', 'three').pipe(
              Stream.ensuring(
                Effect.yieldNow.pipe(
                  Effect.andThen(Effect.sync(() => events.push('producer finalized'))),
                ),
              ),
            ),
          ),
      });

      const result = yield* respond(readTicks(undefined), getERSCIdentity(readTicks)).pipe(
        Scope.provide(requestScope),
      );

      expect(result._tag).toBe('Success');
      if (result._tag !== 'Success' || !(result.value instanceof ReadableStream)) {
        return expect.unreachable('Expected a ReadableStream value.');
      }

      const reader = result.value.getReader();
      const chunks: Array<unknown> = [];
      for (;;) {
        const next = yield* Effect.promise(() => reader.read());
        if (next.done) {
          break;
        }
        chunks.push(next.value);
      }

      expect(chunks).toEqual(['one', 'two', 'three']);
      expect(events).toEqual(['producer finalized']);
      yield* Scope.close(requestScope, Exit.void);
      expect(events).toEqual(['producer finalized', 'request released']);
    }),
  );

  it.effect('leaves a non-Stream success value untouched', () =>
    Effect.gen(function* () {
      const value = { entries: [1, 2], total: 2 };
      const result = yield* serverFnResponse(Effect.succeed(value));

      expect(result._tag === 'Success' && result.value).toBe(value);
    }),
  );

  it.effect.each(['unlocked', 'locked', 'canceling'] as const)(
    'awaits producer finalizers before releasing request resources when the stream is %s',
    (readerState) =>
      Effect.gen(function* () {
        const events: Array<string> = [];
        const started = yield* Deferred.make<void>();
        const finalizing = yield* Deferred.make<void>();
        const finishCleanup = yield* Deferred.make<void>();
        const parentScope = yield* Effect.scope;
        const requestScope = yield* Scope.fork(parentScope);
        yield* Effect.addFinalizer(() => Effect.sync(() => events.push('request released'))).pipe(
          Scope.provide(requestScope),
        );
        const source = Stream.fromEffect(
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        ).pipe(
          Stream.ensuring(
            Effect.gen(function* () {
              events.push('producer finalizing');
              yield* Deferred.succeed(finalizing, undefined);
              yield* Deferred.await(finishCleanup);
              events.push('producer finalized');
            }),
          ),
        );
        const response = yield* serverFnResponse(Effect.succeed(source)).pipe(
          Scope.provide(requestScope),
        );
        if (response._tag !== 'Success' || !(response.value instanceof ReadableStream)) {
          return expect.unreachable('Expected a ReadableStream value.');
        }
        const readable = response.value;
        const reader = readerState === 'unlocked' ? null : readable.getReader();
        yield* Deferred.await(started);
        const cancellation =
          readerState === 'canceling' && reader !== null
            ? Effect.forkChild(Effect.promise(() => reader.cancel()))
            : Effect.succeed(null);
        const canceling = yield* cancellation;
        if (canceling !== null) {
          yield* Deferred.await(finalizing);
        }

        const closing = yield* Effect.forkChild(Scope.close(requestScope, Exit.void));
        const first = yield* Effect.raceFirst(
          Deferred.await(finalizing).pipe(Effect.as('producer finalizing')),
          Fiber.join(closing).pipe(Effect.as('request closed')),
        );
        yield* Effect.yieldNow;
        const beforeCleanup = [...events];

        yield* Deferred.succeed(finishCleanup, undefined);
        // Clean up the consumer too; request interruption may already have errored its stream.
        yield* Effect.promise(() =>
          (reader === null ? readable.cancel() : reader.cancel()).catch(() => undefined),
        );
        yield* Fiber.join(closing);
        if (canceling !== null) {
          yield* Fiber.join(canceling);
        }

        expect(first).toBe('producer finalizing');
        expect(beforeCleanup).toEqual(['producer finalizing']);
        expect(events).toEqual(['producer finalizing', 'producer finalized', 'request released']);
      }),
  );

  it.effect.each(['empty', 'failed'] as const)(
    'finalizes an %s stream exactly once and preserves its outcome',
    (outcome) =>
      Effect.gen(function* () {
        let finalized = 0;
        const defect = new Error('producer failed');
        const parentScope = yield* Effect.scope;
        const requestScope = yield* Scope.fork(parentScope);
        const source = (outcome === 'empty' ? Stream.empty : Stream.die(defect)).pipe(
          Stream.ensuring(Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => finalized++)))),
        );
        const response = yield* serverFnResponse(Effect.succeed(source)).pipe(
          Scope.provide(requestScope),
        );
        if (response._tag !== 'Success' || !(response.value instanceof ReadableStream)) {
          return expect.unreachable('Expected a ReadableStream value.');
        }
        const reader = response.value.getReader();
        const result = yield* Effect.exit(Effect.promise(() => reader.read()));

        expect(finalized).toBe(1);
        yield* Scope.close(requestScope, Exit.void);
        expect(finalized).toBe(1);
        if (outcome === 'empty') {
          expect(result).toEqual(Exit.succeed({ done: true, value: undefined }));
        } else if (Exit.isFailure(result)) {
          expect(Cause.squash(result.cause)).toBe(defect);
        } else {
          expect.unreachable('Expected the original stream defect.');
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
