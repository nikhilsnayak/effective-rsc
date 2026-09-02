// oxlint-disable effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import { Effect, Schema } from 'effect';
import { createFromReadableStream } from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import type { FlightPayload } from '../rsc/flight';
import { NavigationApi } from './navigation-api';
import { makeNavigationResources } from './navigation-resource';
import { startNavigationRuntime } from './navigation-runtime';
import { ReactDOMRenderer } from './react-dom-renderer';

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
    const reactDOMRenderer = yield* ReactDOMRenderer;
    const browserRenderer = yield* reactDOMRenderer.hydrate(document, payload);
    const navigationApi = yield* NavigationApi;
    const navigationResources = yield* makeNavigationResources(
      navigationApi.getCurrentEntry,
      payload.routeTree,
      initialFlightCompleted.promise,
    );
    const navigationRuntime = yield* startNavigationRuntime(browserRenderer, navigationResources);

    if (import.meta.webpackHot) {
      yield* Effect.tryPromise(() => import('../dev/client')).pipe(
        Effect.flatMap(({ startDevClient }) =>
          startDevClient(navigationRuntime.refreshCurrentRoute),
        ),
        Effect.catch((cause) => Effect.logError('Development HMR failed.', cause)),
        Effect.forkScoped,
      );
    }
    return yield* Effect.never;
  }),
);
