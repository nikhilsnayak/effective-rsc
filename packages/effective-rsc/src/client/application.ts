// oxlint-disable effecttsgo/process-env, effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import { Effect, Layer } from 'effect';

import { checkBrowserCapabilities } from './browser-capabilities';
import { BrowserEffectRunner } from './browser-effect-runner';
import { showBrowserFailure } from './browser-screen';
import { FlightClient } from './flight-client';
import { hydrateDocument } from './hydrate';
import { NavigationApi } from './navigation-api';
import { makeNavigationResources } from './navigation-resource';
import { startNavigationRuntime } from './navigation-runtime';
import { ReactDOMRenderer } from './react-dom-renderer';
import { RouteRefresher } from './route-refresh';

const BrowserLayer = Layer.mergeAll(
  FlightClient.layer,
  ReactDOMRenderer.layer.pipe(Layer.provideMerge(BrowserEffectRunner.layer)),
  RouteRefresher.layer,
).pipe(Layer.provideMerge(NavigationApi.layer), Layer.provide(BrowserHttpClient.layerFetch));

const renderBrowserFailure = Effect.sync(showBrowserFailure);

const skipHydration = (missingApi: string) =>
  process.env.NODE_ENV === 'development'
    ? Effect.logWarning(
        `effective-rsc did not hydrate because this browser does not provide ${missingApi}. The server-rendered document remains a plain multi-page application.`,
      )
    : Effect.void;

const activateClientNavigation = Effect.gen(function* () {
  yield* checkBrowserCapabilities;
  const { browserRenderer, initialFlightCompleted, payload } = yield* hydrateDocument;
  const navigationApi = yield* NavigationApi;
  const navigationResources = yield* makeNavigationResources(
    navigationApi.getCurrentEntry,
    payload.routeTree,
    initialFlightCompleted,
  );
  yield* startNavigationRuntime(browserRenderer, navigationResources);
});

export const browserMain = Effect.scoped(
  Effect.gen(function* () {
    if (process.env.NODE_ENV === 'development') {
      yield* Effect.tryPromise(() => import('../dev/client')).pipe(
        Effect.flatMap(({ startDevClient }) => startDevClient),
        Effect.catch((cause) => Effect.logError('Development client stopped.', cause)),
        Effect.forkScoped,
      );
    }

    yield* activateClientNavigation.pipe(
      Effect.catchTags({
        BrowserHydrationError: () => renderBrowserFailure,
        ReactDOMHydrationError: () => renderBrowserFailure,
        NavigationApiUnavailableError: () => skipHydration('the Navigation API'),
        NavigationPrecommitUnavailableError: () => skipHydration('NavigationPrecommitController'),
      }),
    );
    return yield* Effect.never;
  }),
).pipe(Effect.provide(BrowserLayer));
