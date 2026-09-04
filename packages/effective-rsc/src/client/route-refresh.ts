import { Context, Effect, FiberMap, Layer, Ref, Schema } from 'effect';
import { addTransitionType, startTransition } from 'react';

import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderer } from './browser-renderer';
import { NavigationApi } from './navigation-api';
import { isRoutedNavigation, preserveRequestedHash } from './navigation-routing';
import { RouteLoader } from './route-loader';

const CurrentRouteRefreshKey = 'CurrentRouteRefresh';

class RouteRefreshError extends Schema.TaggedError<RouteRefreshError>()('RouteRefreshError', {
  cause: Schema.Defect(),
}) {}

export type RouteRefreshTransitionType = 'hmr-refresh' | 'server-function';

type RouteRefreshImplementation = {
  readonly interruptCurrentRouteRefresh: Effect.Effect<void>;
  readonly refreshCurrentRoute: (transitionType: RouteRefreshTransitionType) => Effect.Effect<void>;
};

export class RouteRefresher extends Context.Service<RouteRefresher>()(
  'ersc/client/RouteRefresher',
  {
    make: Effect.gen(function* () {
      const navigationApi = yield* NavigationApi;
      const implementation = yield* Ref.make<RouteRefreshImplementation>({
        interruptCurrentRouteRefresh: Effect.void,
        refreshCurrentRoute: () => Effect.sync(navigationApi.reloadDocument),
      });

      const interruptCurrentRouteRefresh = Effect.gen(function* () {
        const current = yield* Ref.get(implementation);
        yield* current.interruptCurrentRouteRefresh;
      });

      const refreshCurrentRoute = Effect.fn('RouteRefresher.refreshCurrentRoute')(function* (
        transitionType: RouteRefreshTransitionType,
      ) {
        const current = yield* Ref.get(implementation);
        yield* current.refreshCurrentRoute(transitionType);
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

  const refreshRoute = Effect.fnUntraced(function* (transitionType: RouteRefreshTransitionType) {
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
    let renderCommitted!: Promise<void>;
    yield* Effect.sync(() => {
      startTransition(() => {
        addTransitionType(transitionType);
        renderCommitted = browserRenderer.refresh(resource.routeTree);
      });
    });
    yield* Effect.all([Effect.promise(() => renderCommitted), resource.completed], {
      concurrency: 'unbounded',
      discard: true,
    }).pipe(Effect.andThen(Effect.sync(commitRefresh)), Effect.ensuring(resource.release));
  });

  const refreshInReactTransition = (transitionType: RouteRefreshTransitionType) =>
    Effect.callback<void, RouteRefreshError>((resume, signal) => {
      startTransition(() =>
        run(refreshRoute(transitionType), { signal }).then(
          () => resume(Effect.void),
          (cause) => resume(Effect.fail(new RouteRefreshError({ cause }))),
        ),
      );
    });

  const refreshCurrentRoute = Effect.fnUntraced(
    function* (transitionType: RouteRefreshTransitionType) {
      routeLoader.invalidate();
      yield* waitForNavigationIdle;
      yield* Effect.raceFirst(refreshInReactTransition(transitionType), waitForRoutedNavigation);
    },
    Effect.catch((cause) => Effect.logError('Failed to refresh the current route.', cause)),
  );

  yield* routeRefresher.replace({
    interruptCurrentRouteRefresh: FiberMap.remove(refreshes, CurrentRouteRefreshKey),
    refreshCurrentRoute: (transitionType) =>
      FiberMap.run(refreshes, CurrentRouteRefreshKey, refreshCurrentRoute(transitionType)).pipe(
        Effect.asVoid,
      ),
  });
});
