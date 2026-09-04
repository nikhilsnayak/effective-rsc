// oxlint-disable effecttsgo/process-env, effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import { Effect, Layer } from 'effect';

import { checkBrowserCapabilities } from './browser-capabilities';
import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderer } from './browser-renderer';
import { showBrowserFailure } from './browser-screen';
import { installCallServer } from './call-server';
import { installClientRouter } from './client-router';
import { FlightClient } from './flight-client';
import { NavigationApi } from './navigation-api';
import { ReactDOMRenderer } from './react-dom-renderer';
import { RouteLoader } from './route-loader';
import { installRouteRefresh, RouteRefresher } from './route-refresh';

const BrowserServicesLayer = Layer.mergeAll(
  BrowserEffectRunner.layer,
  BrowserRenderer.layer,
  FlightClient.layer,
  NavigationApi.layer,
);

const BrowserLayer = Layer.mergeAll(
  ReactDOMRenderer.layer,
  RouteLoader.layer,
  RouteRefresher.layer,
).pipe(Layer.provideMerge(BrowserServicesLayer), Layer.provide(BrowserHttpClient.layerFetch));

const renderBrowserFailure = Effect.sync(showBrowserFailure);

const skipHydration = (missingApi: string) =>
  process.env.NODE_ENV === 'development'
    ? Effect.logWarning(
        `effective-rsc did not hydrate because this browser does not provide ${missingApi}. The server-rendered document remains a plain multi-page application.`,
      )
    : Effect.void;

const activateClientNavigation = Effect.gen(function* () {
  const routeLoader = yield* RouteLoader;
  const reactDOMRenderer = yield* ReactDOMRenderer;

  const initialPayload = yield* routeLoader.loadInitial;
  yield* reactDOMRenderer.hydrate(document, initialPayload);
  yield* installClientRouter;
  yield* installRouteRefresh;
  yield* installCallServer;
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

    yield* checkBrowserCapabilities.pipe(
      Effect.andThen(activateClientNavigation),
      Effect.catchTags({
        FlightLoadError: () => renderBrowserFailure,
        ReactDOMHydrationError: () => renderBrowserFailure,
        NavigationApiUnavailableError: () => skipHydration('the Navigation API'),
        NavigationPrecommitUnavailableError: () => skipHydration('NavigationPrecommitController'),
      }),
    );
    return yield* Effect.never;
  }),
).pipe(Effect.provide(BrowserLayer));
