import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { hydrateRoot } from 'react-dom/client';
import { createFromReadableStream } from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import type { FlightPayload } from '../rsc/flight';

export class BrowserHydrationError extends Schema.TaggedError<BrowserHydrationError>()(
  'BrowserHydrationError',
  { cause: Schema.Defect() },
) {}

export const hydrate = Effect.gen(function* () {
  const payload = yield* Effect.tryPromise<FlightPayload, BrowserHydrationError>({
    try: () => createFromReadableStream<FlightPayload>(rscStream),
    catch: (cause) => new BrowserHydrationError({ cause }),
  });

  yield* Effect.try({
    try: () => hydrateRoot(document, payload.root, { formState: payload.formState }),
    catch: (cause) => new BrowserHydrationError({ cause }),
  });
});
