import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Ref, Schema } from 'effect';

import { Application } from '../../src/application/ersc';
import { type ERSCIdentity, getERSCIdentity } from '../../src/application/ersc-identity';
import { matchServerFnInvocation } from '../../src/application/server-fn';

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  'ersc/tests/application/server-fn/Greeting',
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
  it.effect('rejects direct invocation in the server graph', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc();
      const serverFn = ERSC.ServerFn.make({
        input: Schema.String,
        handler: Effect.succeed,
      });

      yield* Effect.promise(() =>
        expect(serverFn('value')).rejects.toThrow(
          'An ERSC ServerFn is a framework intrinsic and cannot be invoked directly in the server graph.',
        ),
      );
    }),
  );

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

  it.effect('decodes FormData before invoking a form action handler', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc();
      const createGreeting = ERSC.ServerFn.make({
        input: Schema.fromFormData(Schema.Struct({ name: Schema.NonEmptyString })),
        handler: ({ name }) => Effect.succeed(`Hello, ${name}`),
      });
      const formData = new FormData();
      formData.set('name', 'Nikhil');

      const invocation: Promise<string> = createGreeting(formData);
      const result = yield* invocationEffect(invocation, getERSCIdentity(ERSC));

      expect(result).toBe('Hello, Nikhil');
    }),
  );

  it.effect('decodes previous state and FormData with request services', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc<Greeting>();
      const greet = ERSC.ServerFn.make({
        input: [
          Schema.FiniteFromString,
          Schema.fromFormData(Schema.Struct({ name: Schema.NonEmptyString })),
        ],
        handler: Effect.fn('greet')(function* (count, { name }) {
          const greeting = yield* Greeting;
          return `${greeting.prefix}, ${name}: ${count + 1}`;
        }),
      });
      const form = new FormData();
      form.set('name', 'Nikhil');
      const invocation: Promise<string> = greet('2', form);
      const result = yield* invocationEffect(invocation, getERSCIdentity(ERSC));
      expect(result).toBe('Hello, Nikhil: 3');
    }).pipe(Effect.provideService(Greeting, { prefix: 'Hello' })),
  );

  it.effect('validates every positional argument before running the handler', () =>
    Effect.gen(function* () {
      let invoked: 'Waiting' | 'Invoked' = 'Waiting';
      const ERSC = Application.ersc();
      const action = ERSC.ServerFn.make({
        input: [Schema.Finite, Schema.fromFormData(Schema.Struct({ name: Schema.NonEmptyString }))],
        handler: () =>
          Effect.sync(() => {
            invoked = 'Invoked';
          }),
      });
      const form = new FormData();
      form.set('name', 'Nikhil');
      for (const args of [['invalid state', form], [0, new FormData()], [0], []]) {
        const invocation = Reflect.apply(action, null, args);
        const exit = yield* Effect.exit(invocationEffect(invocation, getERSCIdentity(ERSC)));
        expect(exit._tag).toBe('Failure');
      }
      expect(invoked).toBe('Waiting');
    }),
  );

  it.effect('keeps array and tuple Schemas as single arguments', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc();
      const array = ERSC.ServerFn.make({
        input: Schema.Array(Schema.String),
        handler: Effect.succeed,
      });
      const tuple = ERSC.ServerFn.make({
        input: Schema.Tuple([Schema.String, Schema.Finite]),
        handler: Effect.succeed,
      });
      const arrayResult = yield* invocationEffect(
        array(['first', 'second']),
        getERSCIdentity(ERSC),
      );
      const tupleResult = yield* invocationEffect(tuple(['first', 2]), getERSCIdentity(ERSC));
      expect(arrayResult).toEqual(['first', 'second']);
      expect(tupleResult).toEqual(['first', 2]);
    }),
  );

  it.effect('preserves unary handling of omitted and extra native arguments', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc();
      const action = ERSC.ServerFn.make({
        input: Schema.Undefined,
        handler: () => Effect.succeed('done'),
      });
      for (const args of [[], [undefined, 'ignored']]) {
        const result = yield* invocationEffect(
          Reflect.apply(action, null, args),
          getERSCIdentity(ERSC),
        );
        expect(result).toBe('done');
      }
    }),
  );

  it.effect('retains lazy execution and positional order after binding arguments', () =>
    Effect.gen(function* () {
      const values: Array<string> = [];
      const ERSC = Application.ersc();
      const action = ERSC.ServerFn.make({
        input: [Schema.String, Schema.Finite, Schema.String],
        handler: (prefix, count, suffix) =>
          Effect.sync(() => {
            const value = `${prefix}:${count}:${suffix}`;
            values.push(value);
            return value;
          }),
      });
      const invocation = action.bind(null, 'bound')(2, 'tail');
      expect(values).toEqual([]);
      const result = yield* invocationEffect(invocation, getERSCIdentity(ERSC));
      expect(result).toBe('bound:2:tail');
      expect(values).toEqual(['bound:2:tail']);
    }),
  );

  it.effect('supports an empty argument list', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc();
      const action = ERSC.ServerFn.make({ input: [], handler: () => Effect.succeed('done') });
      const result = yield* invocationEffect(action(), getERSCIdentity(ERSC));
      expect(result).toBe('done');
    }),
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

  it('retains the middleware scope on the native invocation metadata', () => {
    const ERSC = Application.ersc();
    const RequireScope = ERSC.Middleware.make((httpEffect) => httpEffect);
    const serverFn = ERSC.withMiddleware(RequireScope).ServerFn.make({
      input: Schema.String,
      handler: Effect.succeed,
    });

    const match = matchServerFnInvocation(serverFn('value'), getERSCIdentity(ERSC));

    expect(match._tag).toBe('Match');
    if (match._tag === 'Match') {
      expect(match.middleware).toEqual([RequireScope]);
    }
  });
});
