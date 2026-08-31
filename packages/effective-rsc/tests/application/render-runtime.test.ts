import { describe, expect, it } from '@effect/vitest';
import { Context, Effect } from 'effect';

import { makeRenderRuntimeContext, type RenderRuntime } from '../../src/application/render-runtime';

class RequestLabel extends Context.Service<RequestLabel, { readonly value: string }>()(
  'ersc/tests/application/render-runtime/RequestLabel',
) {}

const runtimeWithLabel =
  (value: string): RenderRuntime<RequestLabel> =>
  (effect) =>
    Effect.runPromise(effect.pipe(Effect.provideService(RequestLabel, { value })));

describe('RenderRuntimeContext', () => {
  it('throws a programmer error when work runs outside a bound render runtime', () => {
    const context = makeRenderRuntimeContext();

    expect(() => context.run('Component', Effect.void, [])).toThrow(
      new TypeError('ERSC Component rendered outside its application request runtime.'),
    );
  });

  it.effect('keeps interleaved asynchronous render runners isolated', () =>
    Effect.gen(function* () {
      const context = makeRenderRuntimeContext();
      const firstReady = Promise.withResolvers<void>();
      const releaseFirst = Promise.withResolvers<void>();
      const readLabel = Effect.map(RequestLabel, ({ value }) => value);
      const first = context.bind(runtimeWithLabel('first'), [], () =>
        Promise.resolve()
          .then(() => firstReady.resolve())
          .then(() => releaseFirst.promise)
          .then(() => context.run('Component', readLabel, [])),
      );

      yield* Effect.promise(() => firstReady.promise);
      const second = context.bind(runtimeWithLabel('second'), [], () =>
        context.run('Component', readLabel, []).finally(() => releaseFirst.resolve()),
      );
      const labels = yield* Effect.promise(() => Promise.all([first, second]));

      expect(labels).toEqual(['first', 'second']);
    }),
  );
});
