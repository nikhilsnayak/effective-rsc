import { Context, Effect, FiberMap, Layer, Ref, Schema } from 'effect';
import { startTransition } from 'react';

import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderer } from './browser-renderer';
import { NavigationApi } from './navigation-api';
import { isRoutedNavigation, preserveRequestedHash } from './navigation-routing';
import { RouteLoader } from './route-loader';

const CurrentRouteRefreshKey = 'CurrentRouteRefresh';

class RouteRefreshError extends Schema.TaggedError<RouteRefreshError>()('RouteRefreshError', {
  cause: Schema.Defect(),
}) {}

export class RouteRefresher extends Context.Service<RouteRefresher>()(
  'ersc/client/RouteRefresher',
  {
    make: Effect.gen(function* () {
      const navigationApi = yield* NavigationApi;
      const implementation = yield* Ref.make(Effect.sync(navigationApi.reloadDocument));

      return {
        refreshCurrentRoute: Effect.gen(function* () {
          const refreshCurrentRoute = yield* Ref.get(implementation);
          return yield* refreshCurrentRoute;
        }),
        replace: (refreshCurrentRoute: Effect.Effect<void>) =>
          Ref.set(implementation, refreshCurrentRoute),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}

const waitForNavigationIdle = (navigationApi: NavigationApi['Service']) =>
  Effect.suspend(() => {
    const transition = navigationApi.getTransition();
    return transition === null
      ? Effect.succeed('Idle' as const)
      : Effect.promise(() =>
          transition.finished.then(
            () => undefined,
            () => undefined,
          ),
        ).pipe(Effect.as('Settled' as const));
  }).pipe(Effect.repeat({ while: (state) => state === 'Settled' }), Effect.asVoid);

const waitForRoutedNavigation = (navigationApi: NavigationApi['Service']) =>
  Effect.callback<void>((resume) => {
    const onNavigate = (event: NavigateEvent) => {
      if (isRoutedNavigation(event)) {
        resume(Effect.void);
      }
    };
    const unsubscribe = navigationApi.subscribe(onNavigate);
    return Effect.sync(unsubscribe);
  });

export const installRouteRefresh = Effect.gen(function* () {
  const browserRenderer = yield* BrowserRenderer;
  const navigationApi = yield* NavigationApi;
  const routeLoader = yield* RouteLoader;
  const routeRefresher = yield* RouteRefresher;
  const run = yield* BrowserEffectRunner;
  const refreshes = yield* FiberMap.make<typeof CurrentRouteRefreshKey>();

  const refreshRoute = Effect.gen(function* () {
    const currentEntry = navigationApi.getCurrentEntry();
    const destination = new URL(currentEntry?.url ?? navigationApi.getCurrentUrl());
    const resource = yield* routeLoader.load({
      destination: {
        id: currentEntry?.id ?? '',
        url: destination.href,
      },
      navigationType: 'replace',
    });

    if (resource._tag === 'Document') {
      yield* resource.release;
      yield* Effect.sync(navigationApi.reloadDocument);
      return;
    }

    const resolvedDestination = preserveRequestedHash(destination, resource.resolvedUrl);
    if (resolvedDestination.href !== destination.href) {
      yield* resource.release;
      yield* Effect.sync(() => navigationApi.replaceDocument(resolvedDestination.href));
      return;
    }

    const commitRefresh = routeLoader.prepareRefresh(resource.routeTree);
    yield* Effect.all(
      [Effect.promise(() => browserRenderer.refresh(resource.routeTree)), resource.completed],
      { concurrency: 'unbounded', discard: true },
    ).pipe(Effect.andThen(Effect.sync(commitRefresh)), Effect.ensuring(resource.release));
  });

  const refreshInReactTransition = Effect.callback<void, RouteRefreshError>((resume, signal) => {
    startTransition(() =>
      run(refreshRoute, { signal }).then(
        () => resume(Effect.void),
        (cause) => resume(Effect.fail(new RouteRefreshError({ cause }))),
      ),
    );
  });

  const refreshCurrentRoute = Effect.gen(function* () {
    routeLoader.invalidate();
    yield* waitForNavigationIdle(navigationApi);
    yield* Effect.raceFirst(refreshInReactTransition, waitForRoutedNavigation(navigationApi));
  }).pipe(Effect.catch((cause) => Effect.logError('Failed to refresh the current route.', cause)));

  yield* routeRefresher.replace(
    FiberMap.run(refreshes, CurrentRouteRefreshKey, refreshCurrentRoute).pipe(Effect.asVoid),
  );
});
