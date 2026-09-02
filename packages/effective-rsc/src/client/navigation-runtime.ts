import { Effect } from 'effect';

import type { BrowserRenderer } from './browser-renderer';
import { installCallServer } from './call-server';
import { listenForNavigation } from './navigation-listener';
import type { NavigationResources } from './navigation-resource';
import { makeRouteRefresh } from './route-refresh';

export const startNavigationRuntime = Effect.fnUntraced(function* (
  browserRenderer: BrowserRenderer,
  navigationResources: NavigationResources,
) {
  yield* listenForNavigation(browserRenderer, navigationResources);
  yield* installCallServer(browserRenderer, navigationResources);
  return yield* makeRouteRefresh(browserRenderer, navigationResources);
});
