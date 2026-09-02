import { Effect, FiberMap, Schema } from 'effect';
import { startTransition } from 'react';

import { BrowserNavigation } from '../client/browser-navigation';
import type { BrowserRenderer } from '../client/browser-renderer';
import { ClientRuntime } from '../client/client-runtime';
import type { NavigationResources } from '../client/navigation-resource';
import { isRoutedNavigation, preserveRequestedHash } from '../client/navigation-routing';

const CurrentRouteRefreshKey = 'CurrentRouteRefresh';

class BrowserRefreshError extends Schema.TaggedError<BrowserRefreshError>()('BrowserRefreshError', {
  cause: Schema.Defect(),
}) {}

const waitForNavigationIdle = (navigation: Navigation) =>
  Effect.suspend(() => {
    const transition = navigation.transition;
    return transition === null
      ? Effect.succeed('Idle' as const)
      : Effect.promise(() =>
          transition.finished.then(
            () => undefined,
            () => undefined,
          ),
        ).pipe(Effect.as('Settled' as const));
  }).pipe(Effect.repeat({ while: (state) => state === 'Settled' }), Effect.asVoid);

const waitForRoutedNavigation = (navigation: Navigation) =>
  Effect.callback<void>((resume) => {
    const onNavigate = (event: NavigateEvent) => {
      if (isRoutedNavigation(event)) {
        resume(Effect.void);
      }
    };
    navigation.addEventListener('navigate', onNavigate);
    return Effect.sync(() => navigation.removeEventListener('navigate', onNavigate));
  });

export const makeBrowserRefresh = Effect.fnUntraced(function* (
  browserRenderer: BrowserRenderer,
  navigationResources: NavigationResources,
) {
  const { browserNavigation, refreshes, run } = yield* Effect.all({
    browserNavigation: BrowserNavigation,
    refreshes: FiberMap.make<typeof CurrentRouteRefreshKey>(),
    run: ClientRuntime,
  });
  const navigation = browserNavigation.navigation;

  const refreshRoute = Effect.gen(function* () {
    const currentEntry = navigation.currentEntry;
    const destination = new URL(currentEntry?.url ?? browserNavigation.location.href);
    const resource = yield* navigationResources.load({
      destination: {
        id: currentEntry?.id ?? '',
        url: destination.href,
      },
      navigationType: 'replace',
    });

    if (resource._tag === 'Document') {
      yield* resource.release;
      yield* Effect.sync(() => browserNavigation.location.reload());
      return;
    }

    const resolvedDestination = preserveRequestedHash(destination, resource.resolvedUrl);
    if (resolvedDestination.href !== destination.href) {
      yield* resource.release;
      yield* Effect.sync(() => browserNavigation.location.replace(resolvedDestination.href));
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
    yield* waitForNavigationIdle(navigation);
    yield* Effect.raceFirst(refreshInReactTransition, waitForRoutedNavigation(navigation));
  }).pipe(Effect.catch((cause) => Effect.logError('Failed to refresh the current route.', cause)));

  return {
    refreshCurrentRoute: FiberMap.run(refreshes, CurrentRouteRefreshKey, refreshCurrentRoute).pipe(
      Effect.asVoid,
    ),
  };
});
