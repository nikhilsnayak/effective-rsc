import { Context, Effect, FiberSet, Layer } from 'effect';
import { renderToReadableStream } from 'react-server-dom-rspack/server.node';

import type { ApplicationComponent } from '../application/definition';
import type { FlightPayload, ServerFnResult } from '../rsc/flight';

export type TemporaryReferenceSet = unknown;

export class FlightRenderer extends Context.Service<FlightRenderer>()(
  'effective-rsc/server/flight/FlightRenderer',
  {
    make: Effect.succeed({
      render: Effect.fn('FlightRenderer.render')(function* <Services>({
        component: RootComponent,
        formState,
        pathname,
        serverFnResult,
        temporaryReferences,
      }: {
        readonly component: ApplicationComponent<Services>;
        readonly formState: FlightPayload['formState'];
        readonly pathname: `/${string}`;
        readonly serverFnResult: ServerFnResult | null;
        readonly temporaryReferences?: TemporaryReferenceSet;
      }) {
        const signal = yield* Effect.abortSignal;
        const runtime = yield* FiberSet.makeRuntimePromise<Services>();
        const payload = {
          formState,
          root: <RootComponent pathname={pathname} runtime={runtime} />,
          serverFnResult,
        } satisfies FlightPayload;

        return renderToReadableStream(payload, { signal, temporaryReferences });
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
