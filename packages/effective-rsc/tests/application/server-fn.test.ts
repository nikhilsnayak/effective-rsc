import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Ref, Schema } from 'effect';

import { Application } from '../../src/application/ersc';
import { type ERSCIdentity, getERSCIdentity } from '../../src/application/ersc-identity';
import { matchServerFnInvocation } from '../../src/application/server-fn';

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  'effective-rsc/tests/application/server-fn/Greeting',
) {}

const invocationEffect = <Output, Services>(
  invocation: Promise<Output>,
  identity: ERSCIdentity<Services>,
) => {
  const match = matchServerFnInvocation(invocation, identity);
  if (match._tag !== 'Match') {
    return Effect.die('Expected an ERSC ServerFn invocation.');
  }

  return match.effect;
};

describe('ServerFn.make', () => {
  it.effect('validates input and runs the handler with request services', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc<Greeting>();
      const greet = ERSC.ServerFn.make({
        input: Schema.Struct({ name: Schema.NonEmptyString }),
        handler: Effect.fn('greet')(function* ({ name }) {
          const greeting = yield* Greeting;
          return `${greeting.prefix}, ${name}`;
        }),
      });

      const invocation: Promise<string> = greet({ name: 'Nikhil' });
      const result = yield* invocationEffect(invocation, getERSCIdentity(ERSC));

      expect(result).toBe('Hello, Nikhil');
    }).pipe(Effect.provideService(Greeting, { prefix: 'Hello' })),
  );

  it.effect('rejects untrusted input before invoking the handler', () =>
    Effect.gen(function* () {
      const invoked = yield* Ref.make(false);
      const ERSC = Application.ersc();
      const serverFn = ERSC.ServerFn.make({
        input: Schema.Struct({ value: Schema.NonEmptyString }),
        handler: Effect.fn('serverFn')(function* () {
          yield* Ref.set(invoked, true);
        }),
      });
      const exit = yield* Effect.exit(
        invocationEffect(serverFn({ value: '' }), getERSCIdentity(ERSC)),
      );

      const invokedBeforeRender = yield* Ref.get(invoked);
      expect(exit._tag).toBe('Failure');
      expect(invokedBeforeRender).toBe(false);
    }),
  );

  it.effect('remains lazy until the request handler executes it', () =>
    Effect.gen(function* () {
      const invoked = yield* Ref.make(false);
      const ERSC = Application.ersc();
      const serverFn = ERSC.ServerFn.make({
        input: Schema.Struct({ id: Schema.String }),
        handler: Effect.fn('serverFn')(function* () {
          yield* Ref.set(invoked, true);
        }),
      });

      const invocation = serverFn({ id: 'session' });
      const invokedBeforeExecution = yield* Ref.get(invoked);
      expect(invokedBeforeExecution).toBe(false);

      yield* invocationEffect(invocation, getERSCIdentity(ERSC));
      const invokedAfterExecution = yield* Ref.get(invoked);
      expect(invokedAfterExecution).toBe(true);
    }),
  );

  it('rejects an invocation owned by another ERSC application', () => {
    const First = Application.ersc();
    const Second = Application.ersc();
    const serverFn = First.ServerFn.make({
      input: Schema.String,
      handler: Effect.succeed,
    });

    const match = matchServerFnInvocation(serverFn('value'), getERSCIdentity(Second));

    expect(match._tag).toBe('IdentityMismatch');
  });
});
