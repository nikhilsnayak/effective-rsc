import { describe, expect, it } from '@effect/vitest';
import { Context, Effect } from 'effect';

import {
  makeRequestRuntimeContext,
  type RequestRuntime,
} from '../../src/application/request-runtime';

class RequestLabel extends Context.Service<RequestLabel, { readonly value: string }>()(
  'ersc/tests/application/request-runtime/RequestLabel',
) {}

const runtimeWithLabel =
  (value: string): RequestRuntime<RequestLabel> =>
  (effect) =>
    Effect.runPromise(effect.pipe(Effect.provideService(RequestLabel, { value })));

describe('RequestRuntimeContext', () => {
  it('throws a programmer error when work runs outside a bound request runtime', () => {
    const context = makeRequestRuntimeContext<RequestLabel>();

    expect(() => context.run(Effect.void)).toThrow(
      new TypeError('An ERSC concern rendered outside its application request runtime.'),
    );
  });

  it.effect('keeps interleaved asynchronous request runners isolated', () =>
    Effect.gen(function* () {
      const context = makeRequestRuntimeContext<RequestLabel>();
      const firstReady = Promise.withResolvers<void>();
      const releaseFirst = Promise.withResolvers<void>();
      const readLabel = Effect.map(RequestLabel, ({ value }) => value);
      const first = context.bind(runtimeWithLabel('first'), () =>
        Promise.resolve()
          .then(() => firstReady.resolve())
          .then(() => releaseFirst.promise)
          .then(() => context.run(readLabel)),
      );

      yield* Effect.promise(() => firstReady.promise);
      const second = context.bind(runtimeWithLabel('second'), () =>
        context.run(readLabel).finally(() => releaseFirst.resolve()),
      );
      const labels = yield* Effect.promise(() => Promise.all([first, second]));

      expect(labels).toEqual(['first', 'second']);
    }),
  );
});
