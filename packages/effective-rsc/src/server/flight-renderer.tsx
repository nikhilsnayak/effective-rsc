import { Context, Effect, Exit, FiberSet, Layer, Scope } from 'effect';
import type { TemporaryReferenceSet } from 'react-server-dom-rspack/server.node';
import { renderToReadableStream } from 'react-server-dom-rspack/server.node';

import type { AnyMiddleware } from '../application/middleware';
import type { RenderRuntimeContext } from '../application/render-runtime';
import type { FlightPayload, ServerFnResult } from '../rsc/flight';
import type { RouteTreeModel } from '../rsc/route-tree';

type FlightStream = ReadableStream<Uint8Array>;

type FlightRender = {
  readonly release: Effect.Effect<void>;
  readonly stream: FlightStream;
};

export type FlightRenderOptions<Services> = {
  readonly formState: FlightPayload['formState'];
  readonly middleware: ReadonlyArray<AnyMiddleware<Services>>;
  readonly renderRuntime: RenderRuntimeContext;
  readonly routeTree: RouteTreeModel;
  readonly serverFnResult: ServerFnResult | null;
  readonly temporaryReferences?: TemporaryReferenceSet;
};

export class FlightRenderer extends Context.Service<FlightRenderer>()(
  'ersc/server/flight-renderer/FlightRenderer',
  {
    make: Effect.succeed({
      render: Effect.fn('FlightRenderer.render')(function* <Services>({
        formState,
        middleware,
        renderRuntime,
        routeTree,
        serverFnResult,
        temporaryReferences,
      }: FlightRenderOptions<Services>): Effect.fn.Return<
        FlightRender,
        never,
        Services | Scope.Scope
      > {
        const parentScope = yield* Effect.scope;
        const renderScope = yield* Scope.fork(parentScope);
        const release = Scope.close(renderScope, Exit.void);
        return yield* Effect.gen(function* () {
          const runtime = yield* FiberSet.makeRuntimePromise<Services>().pipe(
            Scope.provide(renderScope),
          );
          const signal = yield* Effect.abortSignal.pipe(Scope.provide(renderScope));
          const stream = renderRuntime.bind(runtime, middleware, () => {
            const payload = { formState, routeTree, serverFnResult } satisfies FlightPayload;
            return renderToReadableStream(payload, {
              onError: (error) => {
                if (!signal.aborted) {
                  void runtime(Effect.logError(error));
                }
              },
              signal,
              temporaryReferences,
            });
          });
          return { release, stream } satisfies FlightRender;
        }).pipe(Effect.onError(() => release));
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
