import { Effect, FiberMap, Schema } from 'effect';
import { startTransition } from 'react';

import { BrowserEffectRunner } from '../client/browser-effect-runner';
import type { BrowserRenderer } from '../client/browser-renderer';
import { NavigationApi } from '../client/navigation-api';
import type { NavigationResources } from '../client/navigation-resource';
import { isRoutedNavigation, preserveRequestedHash } from '../client/navigation-routing';

const CurrentRouteRefreshKey = 'CurrentRouteRefresh';

class BrowserRefreshError extends Schema.TaggedError<BrowserRefreshError>()('BrowserRefreshError', {
  cause: Schema.Defect(),
}) {}

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

export const makeBrowserRefresh = Effect.fnUntraced(function* (
  browserRenderer: BrowserRenderer,
  navigationResources: NavigationResources,
) {
  const { navigationApi, refreshes, run } = yield* Effect.all({
    navigationApi: NavigationApi,
    refreshes: FiberMap.make<typeof CurrentRouteRefreshKey>(),
    run: BrowserEffectRunner,
  });
  const refreshRoute = Effect.gen(function* () {
    const currentEntry = navigationApi.getCurrentEntry();
    const destination = new URL(currentEntry?.url ?? navigationApi.getCurrentUrl());
    const resource = yield* navigationResources.load({
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

    const commitRefresh = navigationResources.prepareRefresh(resource.routeTree);
    yield* Effect.all(
      [Effect.promise(() => browserRenderer.refresh(resource.routeTree)), resource.completed],
      { concurrency: 'unbounded', discard: true },
    ).pipe(Effect.andThen(Effect.sync(commitRefresh)), Effect.ensuring(resource.release));
  });

  const refreshInReactTransition = Effect.callback<void, BrowserRefreshError>((resume, signal) => {
    startTransition(() =>
      run(refreshRoute, { signal }).then(
        () => resume(Effect.void),
        (cause) => resume(Effect.fail(new BrowserRefreshError({ cause }))),
      ),
    );
  });

  const refreshCurrentRoute = Effect.gen(function* () {
    navigationResources.invalidate();
    yield* waitForNavigationIdle(navigationApi);
    yield* Effect.raceFirst(refreshInReactTransition, waitForRoutedNavigation(navigationApi));
  }).pipe(Effect.catch((cause) => Effect.logError('Failed to refresh the current route.', cause)));

  return {
    refreshCurrentRoute: FiberMap.run(refreshes, CurrentRouteRefreshKey, refreshCurrentRoute).pipe(
      Effect.asVoid,
    ),
  };
});
