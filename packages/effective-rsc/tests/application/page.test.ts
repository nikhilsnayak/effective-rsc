import { describe, expect, it } from '@effect/vitest';
import {
  Context,
  Deferred,
  Effect,
  Exit,
  FiberSet,
  Layer,
  Ref,
  Schema,
  SchemaTransformation,
  Scope,
} from 'effect';

import { Application } from '../../src/application/ersc';
import { getERSCIdentity } from '../../src/application/ersc-identity';
import { getPageState } from '../../src/application/page';

class Greeting extends Context.Service<Greeting, { readonly value: string }>()(
  'ersc/tests/application/page/Greeting',
) {}

const ERSC = Application.ersc<Greeting>();
const RootLayout = ERSC.Layout.make({ render: ({ children }) => Effect.succeed(children) });

describe('ERSC.Page.make', () => {
  it.effect('decodes dynamic route params before invoking the render operation', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<Greeting>();
      const PageComponent = ERSC.Page.make({
        params: Schema.Struct({
          day: Schema.Literals(['saturday', 'sunday']),
        }),
        render: Effect.fnUntraced(function* ({ params }) {
          const greeting = yield* Greeting;
          return `${greeting.value} ${params.day}`;
        }),
      });
      const typecheckOpaquePage = () => {
        // @ts-expect-error The React adapter is private to framework runtime modules.
        void PageComponent.component;
        // @ts-expect-error The parameter Schema is private to framework runtime modules.
        void PageComponent.paramsSchema;
      };
      const rendered = yield* Effect.promise(() =>
        getERSCIdentity(PageComponent).requestRuntime.bind(runtime, () =>
          getPageState(PageComponent).component({ params: { day: 'sunday' } }),
        ),
      );

      expect(rendered).toBe('hello sunday');
      expect(getPageState(PageComponent).paramsSchema).not.toBeNull();
      expect(Object.isFrozen(PageComponent)).toBe(true);
      expect(typecheckOpaquePage).toBeTypeOf('function');
    }).pipe(Effect.provideService(Greeting, { value: 'hello' })),
  );

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
        layer: Layer.succeed(Greeting, { value: 'application greeting' }),
      });

      const rendered = yield* Effect.promise(() =>
        getERSCIdentity(App).requestRuntime.bind(runtime, () =>
          getPageState(PageComponent).component({ params: {} }),
        ),
      );

      expect(rendered).toBe('hello from the request');
      expect(getPageState(PageComponent).paramsSchema).toBeNull();
    }).pipe(Effect.provideService(Greeting, { value: 'hello from the request' })),
  );

  it.effect('decodes encoded path keys into the Schema output consumed by render', () =>
    Effect.gen(function* () {
      const runtime = yield* FiberSet.makeRuntimePromise<never>();
      const TransformERSC = Application.ersc();
      const PageComponent = TransformERSC.Page.make({
        params: Schema.Struct({ slug: Schema.String }).pipe(
          Schema.decodeTo(
            Schema.Struct({ id: Schema.String }),
            SchemaTransformation.transform({
              decode: ({ slug }) => ({ id: slug }),
              encode: ({ id }) => ({ slug: id }),
            }),
          ),
        ),
        render: ({ params }) => Effect.succeed(params.id),
      });
      const rendered = yield* Effect.promise(() =>
        getERSCIdentity(PageComponent).requestRuntime.bind(runtime, () =>
          getPageState(PageComponent).component({ params: { slug: 'opening-keynote' } }),
        ),
      );

      expect(rendered).toBe('opening-keynote');
    }),
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
      const execution = getERSCIdentity(App)
        .requestRuntime.bind(runtime, () => getPageState(InterruptPage).component({ params: {} }))
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
