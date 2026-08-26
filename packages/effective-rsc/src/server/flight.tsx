import { Effect, FiberSet, Layer } from 'effect';
import { renderToReadableStream } from 'react-server-dom-rspack/server.node';

import type { FlightPayload } from '../rsc/flight';
import { FlightRenderer, type FlightRenderOptions } from './flight-renderer';

const make = Effect.succeed(
  FlightRenderer.of({
    render: Effect.fn('FlightRenderer.render')(function* <Services>({
      formState,
      requestRuntime,
      routeTree,
      serverFnResult,
      temporaryReferences,
    }: FlightRenderOptions<Services>) {
      const signal = yield* Effect.abortSignal;
      const runtime = yield* FiberSet.makeRuntimePromise<Services>();
      return requestRuntime.bind(runtime, () => {
        const payload = {
          formState,
          routeTree,
          serverFnResult,
        } satisfies FlightPayload;

        return renderToReadableStream(payload, { signal, temporaryReferences });
      });
    }),
  }),
);

export const FlightRendererLayer = Layer.effect(FlightRenderer, make);
