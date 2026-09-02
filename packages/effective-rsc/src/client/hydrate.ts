// oxlint-disable effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import { Effect, Schema } from 'effect';
import { createFromReadableStream } from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import type { FlightPayload } from '../rsc/flight';
import { ReactDOMRenderer } from './react-dom-renderer';

export class BrowserHydrationError extends Schema.TaggedError<BrowserHydrationError>()(
  'BrowserHydrationError',
  { cause: Schema.Defect() },
) {}

export const hydrateDocument = Effect.gen(function* () {
  const initialFlightCompleted = Promise.withResolvers<void>();
  const initialFlightStream = rscStream.pipeThrough(
    new TransformStream({
      flush: () => initialFlightCompleted.resolve(),
      transform: (chunk, controller) => controller.enqueue(chunk),
    }),
  );
  const payload = yield* Effect.tryPromise({
    try: () =>
      createFromReadableStream<FlightPayload>(
        initialFlightStream,
        process.env.NODE_ENV === 'development' ? { startTime: 0 } : undefined,
      ),
    catch: (cause) => new BrowserHydrationError({ cause }),
  });
  const reactDOMRenderer = yield* ReactDOMRenderer;
  const browserRenderer = yield* reactDOMRenderer.hydrate(document, payload);

  return {
    browserRenderer,
    initialFlightCompleted: initialFlightCompleted.promise,
    payload,
  };
});
