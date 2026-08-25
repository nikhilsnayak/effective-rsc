import { describe, expect, it } from '@effect/vitest';
import { Context, Deferred, Effect, Exit, FiberSet, Ref, Scope } from 'effect';

import { Application } from '../../src/application/ersc';
import { ERSCIdentityTypeId } from '../../src/application/ersc-identity';
import type { RequestRuntime } from '../../src/application/request-runtime';

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  'effective-rsc/tests/application/component/Greeting',
) {}

describe('ERSC.Component.make', () => {
  it.effect('runs props and services through the request runtime', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc<Greeting>();
      const runtime = yield* FiberSet.makeRuntimePromise<Greeting>();
      const GreetingComponent = ERSC.Component.make({
        render: Effect.fnUntraced(function* ({ name }: { readonly name: string }) {
          const greeting = yield* Greeting;
          return <p>{`${greeting.prefix}, ${name}`}</p>;
        }),
      });

      const rendered = yield* Effect.promise(() =>
        ERSC[ERSCIdentityTypeId].requestRuntime.bind(runtime, () =>
          GreetingComponent({ name: 'Nikhil' }),
        ),
      );

      expect(rendered).toEqual(<p>Hello, Nikhil</p>);
    }).pipe(Effect.provideService(Greeting, { prefix: 'Hello' })),
  );

  it.effect('invokes the authored renderer from inside Effect execution', () =>
    Effect.gen(function* () {
      const ERSC = Application.ersc();
      let runtimeEntered = false;
      const runtime: RequestRuntime<never> = (effect) => {
        runtimeEntered = true;
        // oxlint-disable-next-line effecttsgo/run-effect-inside-effect -- custom request runner under test
        return Effect.runPromise(effect).finally(() => {
          runtimeEntered = false;
        });
      };
      const Component = ERSC.Component.make({
        render: () => {
          expect(runtimeEntered).toBe(true);
          return Effect.succeed(<p>Rendered</p>);
        },
      });

      const rendered = yield* Effect.promise(() =>
        ERSC[ERSCIdentityTypeId].requestRuntime.bind(runtime, () => Component({})),
      );

      expect(rendered).toEqual(<p>Rendered</p>);
      expect(runtimeEntered).toBe(false);
    }),
  );

  it.effect('interrupts component work when its request scope closes', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Ref.make(false);
      const runtime = yield* FiberSet.makeRuntimePromise<never>().pipe(Scope.provide(scope));
      const ERSC = Application.ersc();
      const Component = ERSC.Component.make({
        render: Effect.fnUntraced(function* () {
          yield* Deferred.succeed(started, void 0);
          return yield* Effect.never.pipe(Effect.onInterrupt(() => Ref.set(interrupted, true)));
        }),
      });
      const execution = ERSC[ERSCIdentityTypeId].requestRuntime
        .bind(runtime, () => Component({}))
        .then(
          () => 'completed' as const,
          () => 'interrupted' as const,
        );

      yield* Deferred.await(started);
      yield* Scope.close(scope, Exit.void);

      const result = yield* Effect.promise(() => execution);
      expect(result).toBe('interrupted');
      expect(yield* Ref.get(interrupted)).toBe(true);
    }),
  );
});
