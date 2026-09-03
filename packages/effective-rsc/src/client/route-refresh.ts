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

type RouteRefreshImplementation = {
  readonly interruptCurrentRouteRefresh: Effect.Effect<void>;
  readonly refreshCurrentRoute: Effect.Effect<void>;
};

export class RouteRefresher extends Context.Service<RouteRefresher>()(
  'ersc/client/RouteRefresher',
  {
    make: Effect.gen(function* () {
      const navigationApi = yield* NavigationApi;
      const implementation = yield* Ref.make<RouteRefreshImplementation>({
        interruptCurrentRouteRefresh: Effect.void,
        refreshCurrentRoute: Effect.sync(navigationApi.reloadDocument),
      });

      const interruptCurrentRouteRefresh = Effect.gen(function* () {
        const current = yield* Ref.get(implementation);
        yield* current.interruptCurrentRouteRefresh;
      });

      const refreshCurrentRoute = Effect.gen(function* () {
        const current = yield* Ref.get(implementation);
        yield* current.refreshCurrentRoute;
      });

      return {
        interruptCurrentRouteRefresh,
        refreshCurrentRoute,
        replace: (replacement: RouteRefreshImplementation) => Ref.set(implementation, replacement),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}

export const installRouteRefresh = Effect.gen(function* () {
  const browserRenderer = yield* BrowserRenderer;
  const navigationApi = yield* NavigationApi;
  const routeLoader = yield* RouteLoader;
  const routeRefresher = yield* RouteRefresher;
  const run = yield* BrowserEffectRunner;
  const refreshes = yield* FiberMap.make<typeof CurrentRouteRefreshKey>();

  const waitForNavigationIdle = Effect.suspend(() => {
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

  const waitForRoutedNavigation = Effect.callback<void>((resume) => {
    const onNavigate = (event: NavigateEvent) => {
      if (isRoutedNavigation(event)) {
        resume(Effect.void);
      }
    };
    const unsubscribe = navigationApi.subscribe(onNavigate);
    return Effect.sync(unsubscribe);
  });

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
    yield* waitForNavigationIdle;
    yield* Effect.raceFirst(refreshInReactTransition, waitForRoutedNavigation);
  }).pipe(Effect.catch((cause) => Effect.logError('Failed to refresh the current route.', cause)));

  yield* routeRefresher.replace({
    interruptCurrentRouteRefresh: FiberMap.remove(refreshes, CurrentRouteRefreshKey),
    refreshCurrentRoute: FiberMap.run(refreshes, CurrentRouteRefreshKey, refreshCurrentRoute).pipe(
      Effect.asVoid,
    ),
  });
});
