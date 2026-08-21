import { Context, Effect, FiberSet, Layer } from 'effect';
import { renderToReadableStream } from 'react-server-dom-rspack/server.node';

import type { ApplicationComponent } from '../application/definition';
import type { FlightPayload } from '../rsc/flight';

export class FlightRenderer extends Context.Service<FlightRenderer>()(
  'effective-rsc/server/flight/FlightRenderer',
  {
    make: Effect.succeed({
      render: Effect.fn('FlightRenderer.render')(function* <Services>({
        component: RootComponent,
        formState,
      }: {
        readonly component: ApplicationComponent<Services>;
        readonly formState: FlightPayload['formState'];
      }) {
        const signal = yield* Effect.abortSignal;
        const runtime = yield* FiberSet.makeRuntimePromise<Services>();
        const payload: FlightPayload = {
          formState,
          root: <RootComponent runtime={runtime} />,
        };

        return renderToReadableStream(payload, { signal });
      }),
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
