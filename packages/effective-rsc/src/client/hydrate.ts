import { Effect, Schema } from 'effect';
import { createFromReadableStream } from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import type { FlightPayload } from '../rsc/flight';
import { BrowserNavigation } from './browser-navigation';
import { hydrateBrowserRoot } from './browser-root';
import { installCallServer } from './call-server';
import { listenForNavigation } from './navigation-api';
import { makeNavigationResources } from './navigation-resource';

export class BrowserHydrationError extends Schema.TaggedError<BrowserHydrationError>()(
  'BrowserHydrationError',
  { cause: Schema.Defect() },
) {}

export const hydrate = Effect.scoped(
  Effect.gen(function* () {
    const initialFlightCompleted = Promise.withResolvers<void>();
    const initialFlightStream = rscStream.pipeThrough(
      new TransformStream({
        flush: () => initialFlightCompleted.resolve(),
        transform: (chunk, controller) => controller.enqueue(chunk),
      }),
    );
    const payload = yield* Effect.tryPromise({
      try: () => createFromReadableStream<FlightPayload>(initialFlightStream),
      catch: (cause) => new BrowserHydrationError({ cause }),
    });
    const browserRoot = yield* hydrateBrowserRoot(document, payload);
    const { navigation } = yield* BrowserNavigation;
    const navigationResources = yield* makeNavigationResources(
      navigation,
      payload.routeTree,
      initialFlightCompleted.promise,
    );

    yield* listenForNavigation(browserRoot, navigationResources);
    yield* installCallServer(browserRoot, navigationResources);

    return yield* Effect.never;
  }),
);
