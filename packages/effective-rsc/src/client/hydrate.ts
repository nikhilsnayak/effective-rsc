import { Effect, Schema } from 'effect';
import { createFromReadableStream } from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import type { FlightPayload } from '../rsc/flight';
import { hydrateBrowserRoot } from './browser-root';
import { installCallServer } from './call-server';
import { listenForNavigation } from './navigation-api';

export class BrowserHydrationError extends Schema.TaggedError<BrowserHydrationError>()(
  'BrowserHydrationError',
  { cause: Schema.Defect() },
) {}

export const hydrate = Effect.scoped(
  Effect.gen(function* () {
    const payload = yield* Effect.tryPromise({
      try: () => createFromReadableStream<FlightPayload>(rscStream),
      catch: (cause) => new BrowserHydrationError({ cause }),
    });
    const browserRoot = yield* hydrateBrowserRoot(document, payload).pipe(
      Effect.mapError((cause) => new BrowserHydrationError({ cause })),
    );

    yield* installCallServer(browserRoot);
    yield* listenForNavigation(browserRoot);

    return yield* Effect.never;
  }),
);
