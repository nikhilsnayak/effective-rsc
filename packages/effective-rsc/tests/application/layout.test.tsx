import { describe, expect, it } from '@effect/vitest';
import { Context, Deferred, Effect, Exit, FiberSet, Ref, Scope } from 'effect';

import { Layout, type LayoutProps } from '../../src/application/layout';

class ShellTitle extends Context.Service<ShellTitle, { readonly value: string }>()(
  'effective-rsc/tests/application/layout/ShellTitle',
) {}

describe('Layout.make', () => {
  it('rejects duplicate and explicitly declared children slots', () => {
    const render = () => Effect.succeed(<main />);

    expect(() => Layout.make({ slots: ['children'], render })).toThrowError(
      'Layout slot "children" is implicit',
    );
    expect(() => Layout.make({ slots: ['sidebar', 'sidebar'], render })).toThrowError(
      'Layout slot "sidebar" is declared more than once.',
    );
  });

  it.effect('runs an Effect.fnUntraced operation with children and request services', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<ShellTitle>();
      const LayoutComponent = Layout.make({
        slots: [],
        render: Effect.fnUntraced(function* ({ children }: LayoutProps) {
          const title = yield* ShellTitle;
          return (
            <html lang='en'>
              <head>
                <title>{title.value}</title>
              </head>
              <body>{children}</body>
            </html>
          );
        }),
      });

      const rendered = yield* Effect.promise(() =>
        Promise.resolve(LayoutComponent({ children: <main>Home</main>, runtime })),
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
      const LayoutComponent = Layout.make({
        slots: [],
        render: Effect.fnUntraced(function* (_props: LayoutProps) {
          yield* Deferred.succeed(started, void 0);
          return yield* Effect.never.pipe(Effect.onInterrupt(() => Ref.set(interrupted, true)));
        }),
      });
      const execution = Promise.resolve(LayoutComponent({ children: null, runtime })).then(
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
