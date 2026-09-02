// oxlint-disable effecttsgo/process-env -- Rspack replaces NODE_ENV at compile time.
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

const ClientLayer = Layer.mergeAll(
  NavigationApi.layer,
  FlightClient.layer,
  ReactDOMRenderer.layer.pipe(Layer.provideMerge(BrowserEffectRunner.layer)),
).pipe(Layer.provide(BrowserHttpClient.layerFetch));

const renderBrowserFailure = Effect.sync(showBrowserFailure);

const skipHydration = (missingApi: string) =>
  process.env.NODE_ENV === 'development'
    ? Effect.logWarning(
        `effective-rsc did not hydrate because this browser does not provide ${missingApi}. The server-rendered document remains a plain multi-page application.`,
      )
    : Effect.void;

const startBrowser = Effect.gen(function* () {
  yield* checkBrowserCapabilities;
  const { browserRenderer, initialFlightCompleted, payload } = yield* hydrateDocument;
  const navigationApi = yield* NavigationApi;
  const navigationResources = yield* makeNavigationResources(
    navigationApi.getCurrentEntry,
    payload.routeTree,
    initialFlightCompleted,
  );
  const navigationRuntime = yield* startNavigationRuntime(browserRenderer, navigationResources);

  if (import.meta.webpackHot) {
    yield* Effect.tryPromise(() => import('../dev/client')).pipe(
      Effect.flatMap(({ startDevClient }) => startDevClient(navigationRuntime.refreshCurrentRoute)),
      Effect.catch((cause) => Effect.logError('Development HMR failed.', cause)),
      Effect.forkScoped,
    );
  }
  return yield* Effect.never;
});

export const browserMain = Effect.scoped(startBrowser).pipe(
  Effect.provide(ClientLayer),
  Effect.catchTags({
    BrowserHydrationError: () => renderBrowserFailure,
    ReactDOMHydrationError: () => renderBrowserFailure,
    NavigationApiUnavailableError: () => skipHydration('the Navigation API'),
    NavigationPrecommitUnavailableError: () => skipHydration('NavigationPrecommitController'),
  }),
);
