import { Context, type Effect, type Scope } from 'effect';
import type { TemporaryReferenceSet } from 'react-server-dom-rspack/server.node';

import type { RequestRuntimeContext } from '../application/request-runtime';
import type { RouteTreeModel } from '../application/route-tree';
import type { FlightPayload, ServerFnResult } from '../rsc/flight';

type FlightStream = ReadableStream<Uint8Array>;

export type FlightRenderOptions<Services> = {
  readonly formState: FlightPayload['formState'];
  readonly requestRuntime: RequestRuntimeContext<Services>;
  readonly routeTree: RouteTreeModel;
  readonly serverFnResult: ServerFnResult | null;
  readonly temporaryReferences?: TemporaryReferenceSet;
};

export class FlightRenderer extends Context.Service<
  FlightRenderer,
  {
    render<Services>(
      options: FlightRenderOptions<Services>,
    ): Effect.Effect<FlightStream, never, Services | Scope.Scope>;
  }
>()('effective-rsc/server/flight-renderer/FlightRenderer') {}
