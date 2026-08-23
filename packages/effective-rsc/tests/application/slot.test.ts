import { describe, expect, it } from '@effect/vitest';
import { Context, Deferred, Effect, Exit, FiberSet, Ref, Scope } from 'effect';

import { Slot } from '../../src/application/slot';

class NavigationLabel extends Context.Service<NavigationLabel, { readonly value: string }>()(
  'effective-rsc/tests/application/slot/NavigationLabel',
) {}

describe('Slot.make', () => {
  it.effect('runs its Effect operation with request services', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<NavigationLabel>();
      const Sidebar = Slot.make(
        Effect.fnUntraced(function* () {
          const label = yield* NavigationLabel;
          return label.value;
        }),
      );

      const result = yield* Effect.promise(() => Sidebar({ runtime }));
      expect(result).toBe('Navigation');
    }).pipe(Effect.provideService(NavigationLabel, { value: 'Navigation' })),
  );

  it.effect('interrupts its operation when the request scope closes', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Ref.make(false);
      const runtime = yield* FiberSet.makeRuntimePromise<never>().pipe(Scope.provide(scope));
      const Sidebar = Slot.make(() =>
        Deferred.succeed(started, void 0).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Ref.set(interrupted, true)),
        ),
      );
      const execution = Sidebar({ runtime }).then(
        () => 'completed' as const,
        () => 'interrupted' as const,
      );

      yield* Deferred.await(started);
      yield* Scope.close(scope, Exit.void);

      const result = yield* Effect.promise(() => execution);
      const wasInterrupted = yield* Ref.get(interrupted);
      expect(result).toBe('interrupted');
      expect(wasInterrupted).toBe(true);
    }),
  );
});
