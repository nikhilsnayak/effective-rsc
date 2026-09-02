import { Effect } from 'effect';

import type { BrowserRenderer } from './browser-renderer';
import { installCallServer } from './call-server';
import { listenForNavigation } from './navigation-listener';
import { makeNavigationRouteRefresh, RouteRefresher } from './route-refresh';

export const startNavigationRuntime = Effect.fnUntraced(function* (
  browserRenderer: BrowserRenderer,
) {
  yield* listenForNavigation(browserRenderer);
  yield* installCallServer(browserRenderer);
  const routeRefresher = yield* RouteRefresher;
  const refreshCurrentRoute = yield* makeNavigationRouteRefresh(browserRenderer);
  yield* routeRefresher.replace(refreshCurrentRoute);
});
