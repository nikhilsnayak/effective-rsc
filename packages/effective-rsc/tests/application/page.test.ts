import { describe, expect, it } from '@effect/vitest';
import { Context, Deferred, Effect, Exit, FiberSet, Layer, Ref, Scope } from 'effect';

import { Application } from '../../src/application/ersc';
import { ERSCIdentityTypeId } from '../../src/application/ersc-identity';

class Greeting extends Context.Service<Greeting, { readonly value: string }>()(
  'effective-rsc/tests/application/page/Greeting',
) {}

const ERSC = Application.ersc<Greeting>();
const RootLayout = ERSC.Layout.make({ render: ({ children }) => Effect.succeed(children) });

describe('ERSC.Page.make', () => {
  it.effect('runs an Effect.fnUntraced operation with request services', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<Greeting>();
      const PageComponent = ERSC.Page.make({
        render: Effect.fnUntraced(function* () {
          const greeting = yield* Greeting;
          return greeting.value;
        }),
      });
      const App = ERSC.make({
        routes: ERSC.Routes.make({ layout: RootLayout }).page('/', PageComponent),
        servicesLayer: Layer.succeed(Greeting, { value: 'application greeting' }),
      });

      const rendered = yield* Effect.promise(() =>
        App[ERSCIdentityTypeId].requestRuntime.bind(runtime, PageComponent),
      );

      expect(rendered).toBe('hello from the request');
    }).pipe(Effect.provideService(Greeting, { value: 'hello from the request' })),
  );

  it.effect('interrupts the page operation when its request scope closes', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Ref.make(false);
      const runtime = yield* FiberSet.makeRuntimePromise<never>().pipe(Scope.provide(scope));
      const InterruptERSC = Application.ersc();
      const InterruptLayout = InterruptERSC.Layout.make({
        render: ({ children }) => Effect.succeed(children),
      });
      const InterruptPage = InterruptERSC.Page.make({
        render: () =>
          Deferred.succeed(started, void 0).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Ref.set(interrupted, true)),
          ),
      });
      const App = InterruptERSC.make({
        routes: InterruptERSC.Routes.make({ layout: InterruptLayout }).page('/', InterruptPage),
      });
      const execution = App[ERSCIdentityTypeId].requestRuntime.bind(runtime, InterruptPage).then(
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
