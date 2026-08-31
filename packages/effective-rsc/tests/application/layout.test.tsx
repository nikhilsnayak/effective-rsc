import { describe, expect, it } from '@effect/vitest';
import { Context, Deferred, Effect, Exit, FiberSet, Layer, Ref, Scope } from 'effect';
import type { ReactNode } from 'react';

import { Application } from '../../src/application/ersc';
import { getERSCIdentity } from '../../src/application/ersc-identity';

class ShellTitle extends Context.Service<ShellTitle, { readonly value: string }>()(
  'ersc/tests/application/layout/ShellTitle',
) {}

const ERSC = Application.ersc<ShellTitle>();

describe('ERSC.Layout.make', () => {
  it('rejects rendering outside its application request runtime', () => {
    const ServiceFreeERSC = Application.ersc();
    const Layout = ServiceFreeERSC.Layout.make({
      render: ({ children }) => Effect.succeed(children),
    });

    expect(() => Layout({ children: null })).toThrow(
      new TypeError('ERSC Layout rendered outside its application request runtime.'),
    );
  });

  it.effect('infers children as an immediately renderable node', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<never>();
      const ServiceFreeERSC = Application.ersc();
      const PassthroughLayout = ServiceFreeERSC.Layout.make({
        render: ({ children }) => Effect.succeed(children),
      });
      const Page = ServiceFreeERSC.Page.make({ render: () => Effect.succeed(null) });
      const App = ServiceFreeERSC.make({
        routes: ServiceFreeERSC.Routes.make({ layout: PassthroughLayout }).page('/', Page),
      });
      const child = <main>Home</main>;

      const rendered = yield* Effect.promise(() =>
        getERSCIdentity(App).renderRuntime.bind(runtime, [], () =>
          PassthroughLayout({ children: child }),
        ),
      );

      expect(rendered).toBe(child);
    }),
  );

  it.effect('runs an Effect operation with children and request services', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<ShellTitle>();
      const LayoutComponent = ERSC.Layout.make({
        render: Effect.fnUntraced(function* ({ children }) {
          const inferredChildren: ReactNode = children;
          const title = yield* ShellTitle;
          return (
            <html lang='en'>
              <head>
                <title>{title.value}</title>
              </head>
              <body>{inferredChildren}</body>
            </html>
          );
        }),
      });
      const Page = ERSC.Page.make({ render: () => Effect.succeed(null) });
      const App = ERSC.make({
        routes: ERSC.Routes.make({ layout: LayoutComponent }).page('/', Page),
        layer: Layer.succeed(ShellTitle, { value: 'application title' }),
      });

      const rendered = yield* Effect.promise(() =>
        getERSCIdentity(App).renderRuntime.bind(runtime, [], () =>
          LayoutComponent({ children: <main>Home</main> }),
        ),
      );

      expect(rendered).toEqual(
        <html lang='en'>
          <head>
            <title>Request title</title>
          </head>
          <body>
            <main>Home</main>
          </body>
        </html>,
      );
    }).pipe(Effect.provideService(ShellTitle, { value: 'Request title' })),
  );

  it.effect('interrupts the layout operation when its request scope closes', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Ref.make(false);
      const runtime = yield* FiberSet.makeRuntimePromise<never>().pipe(Scope.provide(scope));
      const InterruptERSC = Application.ersc();
      const LayoutComponent = InterruptERSC.Layout.make({
        render: Effect.fnUntraced(function* (_props) {
          yield* Deferred.succeed(started, void 0);
          return yield* Effect.never.pipe(Effect.onInterrupt(() => Ref.set(interrupted, true)));
        }),
      });
      const Page = InterruptERSC.Page.make({ render: () => Effect.succeed(null) });
      const App = InterruptERSC.make({
        routes: InterruptERSC.Routes.make({ layout: LayoutComponent }).page('/', Page),
      });
      const execution = getERSCIdentity(App)
        .renderRuntime.bind(runtime, [], () => LayoutComponent({ children: null }))
        .then(
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
