import { Context, Effect, FiberSet, Layer, type Scope } from 'effect';
import type { TemporaryReferenceSet } from 'react-server-dom-rspack/server.node';
import { renderToReadableStream } from 'react-server-dom-rspack/server.node';

import type { RequestRuntimeContext } from '../application/request-runtime';
import type { FlightPayload, ServerFnResult } from '../rsc/flight';
import type { RouteTreeModel } from '../rsc/route-tree';

type FlightStream = ReadableStream<Uint8Array>;

export type FlightRenderOptions<Services> = {
  readonly formState: FlightPayload['formState'];
  readonly requestRuntime: RequestRuntimeContext<Services>;
  readonly routeTree: RouteTreeModel;
  readonly serverFnResult: ServerFnResult | null;
  readonly temporaryReferences?: TemporaryReferenceSet;
};

export class FlightRenderer extends Context.Service<FlightRenderer>()(
  'effective-rsc/server/flight-renderer/FlightRenderer',
  {
    make: Effect.succeed({
      render: Effect.fn('FlightRenderer.render')(function* <Services>({
        formState,
        requestRuntime,
        routeTree,
        serverFnResult,
        temporaryReferences,
      }: FlightRenderOptions<Services>): Effect.fn.Return<
        FlightStream,
        never,
        Services | Scope.Scope
      > {
        const signal = yield* Effect.abortSignal;
        const runtime = yield* FiberSet.makeRuntimePromise<Services>();
        return requestRuntime.bind(runtime, () => {
          const payload = { formState, routeTree, serverFnResult } satisfies FlightPayload;
          return renderToReadableStream(payload, { signal, temporaryReferences });
        });
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
