// oxlint-disable effecttsgo/process-env, effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import { Effect, Layer } from 'effect';

import { navigationMode } from './browser-capabilities';
import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderStatus } from './browser-render-status';
import { BrowserRenderer } from './browser-renderer';
import { showBrowserFailure } from './browser-screen';
import { installCallServer } from './call-server';
import { installClientRouter } from './client-router';
import { FlightClient } from './flight-client';
import { InitialFlightStream } from './initial-flight-stream';
import { NavigationApi } from './navigation-api';
import { ReactDOMRenderer } from './react-dom-renderer';
import { RouteLoader } from './route-loader';
import { installRouteRefresh, RouteRefresher } from './route-refresh';

const BrowserServicesLayer = Layer.mergeAll(
  BrowserEffectRunner.layer,
  BrowserRenderer.layer,
  BrowserRenderStatus.layer,
  FlightClient.layer,
  NavigationApi.layer,
).pipe(Layer.provide(InitialFlightStream.layer));

const BrowserLayer = Layer.mergeAll(
  ReactDOMRenderer.layer,
  RouteLoader.layer,
  RouteRefresher.layer,
).pipe(Layer.provideMerge(BrowserServicesLayer), Layer.provide(BrowserHttpClient.layerFetch));

const renderBrowserFailure = Effect.sync(showBrowserFailure);

const activateBrowser = Effect.gen(function* () {
  const routeLoader = yield* RouteLoader;
  const reactDOMRenderer = yield* ReactDOMRenderer;

  const initialPayload = yield* routeLoader.loadInitial;
  yield* reactDOMRenderer.hydrate(document, initialPayload);
  yield* installRouteRefresh;
  yield* installCallServer;
  const mode = yield* navigationMode;
  if (mode === 'Client') {
    yield* installClientRouter;
  }
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

    yield* activateBrowser.pipe(
      Effect.catchTags({
        FlightLoadError: () => renderBrowserFailure,
        ReactDOMHydrationError: () => renderBrowserFailure,
      }),
    );
    return yield* Effect.never;
  }),
).pipe(Effect.provide(BrowserLayer));
