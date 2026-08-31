// oxlint-disable effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import { Effect, Schema } from 'effect';
import { createFromReadableStream } from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import type { FlightPayload } from '../rsc/flight';
import { BrowserNavigation } from './browser-navigation';
import { BrowserRenderer } from './browser-renderer';
import { hydrateBrowserRoot } from './browser-root';
import { installCallServer } from './call-server';
import { listenForNavigation } from './navigation-api';
import { NavigationResources } from './navigation-resource';

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
      try: () =>
        createFromReadableStream<FlightPayload>(
          initialFlightStream,
          process.env.NODE_ENV === 'development' ? { startTime: 0 } : undefined,
        ),
      catch: (cause) => new BrowserHydrationError({ cause }),
    });
    const browserRenderer = yield* hydrateBrowserRoot(document, payload);
    const { navigation } = yield* BrowserNavigation;
    const navigationResources = yield* NavigationResources.make(
      navigation,
      payload.routeTree,
      initialFlightCompleted.promise,
    );

    return yield* Effect.gen(function* () {
      yield* listenForNavigation;
      yield* installCallServer;
      if (import.meta.webpackHot) {
        yield* Effect.tryPromise(() => import('../dev/client')).pipe(
          Effect.flatMap(({ startDevClient }) => startDevClient),
          Effect.catch((cause) => Effect.logError('Development HMR failed.', cause)),
          Effect.forkScoped,
        );
      }

      return yield* Effect.never;
    }).pipe(
      Effect.provideService(BrowserRenderer, browserRenderer),
      Effect.provideService(NavigationResources, navigationResources),
    );
  }),
);
