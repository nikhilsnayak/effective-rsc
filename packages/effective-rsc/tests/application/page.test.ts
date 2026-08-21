import { describe, expect, it } from '@effect/vitest';
import { Context, Deferred, Effect, Exit, FiberSet, Ref, Scope } from 'effect';

import { Page } from '../../src/application/page';

class Greeting extends Context.Service<Greeting, { readonly value: string }>()(
  'effective-rsc/tests/application/page/Greeting',
) {}

describe('Page.make', () => {
  it.effect('runs an Effect.fnUntraced operation with request services', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<Greeting>();
      const PageComponent = Page.make(
        Effect.fnUntraced(function* () {
          const greeting = yield* Greeting;
          return greeting.value;
        }),
      );

      const rendered = yield* Effect.promise(() => PageComponent({ runtime }));

      expect(rendered).toBe('hello from the request');
    }).pipe(Effect.provideService(Greeting, { value: 'hello from the request' })),
  );

  it.effect('interrupts the page operation when its request scope closes', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Ref.make(false);
      const runtime = yield* FiberSet.makeRuntimePromise<never>().pipe(Scope.provide(scope));
      const execution = runtime(
        Deferred.succeed(started, void 0).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Ref.set(interrupted, true)),
        ),
      ).then(
        () => 'completed' as const,
        () => 'interrupted' as const,
      );

      yield* Deferred.await(started);
      yield* Scope.close(scope, Exit.void);

      expect(yield* Effect.promise(() => execution)).toBe('interrupted');
      expect(yield* Ref.get(interrupted)).toBe(true);
    }),
  );
});
