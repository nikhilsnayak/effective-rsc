import { Context, Deferred, type Duration, Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

const QueryNames = [
  'catalog-primary',
  'catalog-secondary',
  'detail-secondary-slow-stream',
] as const;

export class QueryControl extends Context.Service<QueryControl>()(
  '@effective-rsc/framework-e2e/fixture/QueryControl',
  {
    make: Effect.sync(() => {
      // Tests sharing a server run serially. Each hold is released by the test fixture's teardown.
      const held = new Map<
        string,
        { readonly release: Deferred.Deferred<void>; waiting: number }
      >();
      return {
        hold: (name: string) =>
          Effect.sync(() => {
            if (held.has(name)) {
              return false;
            }
            held.set(name, { release: Deferred.makeUnsafe<void>(), waiting: 0 });
            return true;
          }),
        waiting: (name: string) => Effect.sync(() => held.get(name)?.waiting ?? 0),
        release: (name: string) =>
          Effect.sync(() => {
            const query = held.get(name);
            if (query !== undefined) {
              held.delete(name);
              Deferred.doneUnsafe(query.release, Effect.void);
            }
          }),
        delay: Effect.fnUntraced(function* (name: string, latency: Duration.Input) {
          const query = held.get(name);
          if (query === undefined) {
            return yield* Effect.sleep(latency);
          }
          yield* Effect.acquireUseRelease(
            Effect.sync(() => query.waiting++),
            () => Deferred.await(query.release),
            () => Effect.sync(() => query.waiting--),
          );
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}

export const QueryControlHttpLayer = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const control = yield* QueryControl;
    for (const name of QueryNames) {
      const path = `/test/queries/${name}` as const;
      yield* router.add(
        'POST',
        path,
        control
          .hold(name)
          .pipe(Effect.map((created) => HttpServerResponse.empty({ status: created ? 204 : 409 }))),
      );
      yield* router.add(
        'GET',
        path,
        control
          .waiting(name)
          .pipe(Effect.map((waiting) => HttpServerResponse.jsonUnsafe({ waiting }))),
      );
      yield* router.add(
        'DELETE',
        path,
        control.release(name).pipe(Effect.as(HttpServerResponse.empty())),
      );
    }
  }),
);
