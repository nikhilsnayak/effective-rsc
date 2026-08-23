import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Ref, Schema } from 'effect';

import { ServerFn } from '../../src/application/server-fn';

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  'effective-rsc/tests/application/server-fn/Greeting',
) {}

const invocationEffect = <Output, Error, Services>(invocation: unknown) => {
  expect(Effect.isEffect(invocation)).toBe(true);
  return invocation as Effect.Effect<Output, Error, Services>;
};

describe('ServerFn.make', () => {
  it.effect('validates input and runs the handler with request services', () =>
    Effect.gen(function* () {
      const greet = ServerFn.make({
        input: Schema.Struct({ name: Schema.NonEmptyString }),
        handler: Effect.fn('greet')(function* ({ name }) {
          const greeting = yield* Greeting;
          return `${greeting.prefix}, ${name}`;
        }),
      });

      const result = yield* invocationEffect<string, Schema.SchemaError, Greeting>(
        greet({ name: 'Nikhil' }),
      );

      expect(result).toBe('Hello, Nikhil');
    }).pipe(Effect.provideService(Greeting, { prefix: 'Hello' })),
  );

  it.effect('rejects untrusted input before invoking the handler', () =>
    Effect.gen(function* () {
      const invoked = yield* Ref.make(false);
      const serverFn = ServerFn.make({
        input: Schema.Struct({ value: Schema.NonEmptyString }),
        handler: Effect.fn('serverFn')(function* () {
          yield* Ref.set(invoked, true);
        }),
      });
      yield* Effect.flip(
        invocationEffect<void, Schema.SchemaError, never>(serverFn({ value: '' })),
      );

      const invokedBeforeRender = yield* Ref.get(invoked);
      expect(invokedBeforeRender).toBe(false);
    }),
  );

  it.effect('remains lazy until the request handler executes it', () =>
    Effect.gen(function* () {
      const invoked = yield* Ref.make(false);
      const serverFn = ServerFn.make({
        input: Schema.Struct({ id: Schema.String }),
        handler: Effect.fn('serverFn')(function* () {
          yield* Ref.set(invoked, true);
        }),
      });

      const invocation = serverFn({ id: 'session' });
      const invokedBeforeExecution = yield* Ref.get(invoked);
      expect(invokedBeforeExecution).toBe(false);

      yield* invocationEffect<void, Schema.SchemaError, never>(invocation);
      const invokedAfterExecution = yield* Ref.get(invoked);
      expect(invokedAfterExecution).toBe(true);
    }),
  );
});
