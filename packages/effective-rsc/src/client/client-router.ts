import { Effect, Exit } from 'effect';
import { startTransition } from 'react';

import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderer, type BrowserRendererNavigation } from './browser-renderer';
import { NavigationApi } from './navigation-api';
import {
  BrowserNavigationCoordinator,
  type NavigationRenderResult,
} from './navigation-coordinator';
import {
  isHistoryRollback,
  isRoutedNavigation,
  NativeDocumentNavigationInfo,
  preserveRequestedHash,
} from './navigation-routing';
import { RouteLoader, type RouteLoad } from './route-loader';

type NavigationOutcome =
  | { readonly _tag: 'Handled' }
  | {
      readonly _tag: 'Committed';
      readonly redirected: boolean;
      readonly rendererNavigation: BrowserRendererNavigation;
      readonly resolvedDestination: URL;
      readonly resource: Extract<RouteLoad, { readonly _tag: 'Route' }>;
    };

export const installClientRouter = Effect.gen(function* () {
  const browserRenderer = yield* BrowserRenderer;
  const navigationApi = yield* NavigationApi;
  const routeLoader = yield* RouteLoader;
  const run = yield* BrowserEffectRunner;
  const coordinator = new BrowserNavigationCoordinator(navigationApi);

  const openDocument = (event: NavigateEvent, destination: URL) => {
    if (event.navigationType === 'traverse') {
      navigationApi.replaceDocument(destination.href);
      return;
    }
    navigationApi.navigate(destination.href, {
      history: event.navigationType === 'replace' ? 'replace' : 'push',
      info: NativeDocumentNavigationInfo,
    });
  };

  const onNavigate = (event: NavigateEvent) => {
    if (isHistoryRollback(event)) {
      event.intercept({ handler: () => Promise.resolve() });
      return;
    }
    if (!isRoutedNavigation(event)) {
      return;
    }

    const destination = new URL(event.destination.url);
    const attempt = coordinator.begin(event.navigationType);
    // oxlint-disable-next-line effecttsgo/async-function -- Navigation handlers are native Promise boundaries.
    const handler = async (precommitController?: NavigationPrecommitController) => {
      const navigationOutcome = Promise.withResolvers<NavigationOutcome>();

      const navigationAction = Effect.gen(function* () {
        const resource = yield* routeLoader
          .load({
            destination: event.destination,
            navigationType: event.navigationType,
          })
          .pipe(Effect.onError(() => Effect.sync(attempt.fail)));

        if (resource._tag === 'Document') {
          yield* resource.release;
          openDocument(event, destination);
          navigationOutcome.resolve({ _tag: 'Handled' });
          return;
        }

        const resolvedDestination = preserveRequestedHash(destination, resource.resolvedUrl);
        if (resolvedDestination.origin !== destination.origin) {
          yield* resource.release;
          openDocument(event, resolvedDestination);
          navigationOutcome.resolve({ _tag: 'Handled' });
          return;
        }

        const redirected = destination.href !== resolvedDestination.href;
        if (
          redirected &&
          (precommitController === undefined || event.navigationType === 'traverse')
        ) {
          yield* resource.release;
          navigationApi.replaceDocument(resolvedDestination.href);
          navigationOutcome.resolve({ _tag: 'Handled' });
          return;
        }

        const renderResult = yield* Effect.sync(() => {
          let result!: NavigationRenderResult<BrowserRendererNavigation>;
          startTransition(() => {
            result = attempt.render(() => browserRenderer.navigate(resource.routeTree));
          });
          return result;
        });

        if (renderResult._tag === 'Discarded') {
          yield* resource.release;
          navigationOutcome.resolve({ _tag: 'Handled' });
          return;
        }

        yield* Effect.uninterruptibleMask((restore) =>
          restore(Effect.promise(() => renderResult.value.committed)).pipe(
            Effect.tap(
              Effect.sync(() => {
                renderResult.value.complete();
                attempt.complete();
              }),
            ),
            Effect.onExit((exit) =>
              Exit.isFailure(exit)
                ? Effect.promise(() =>
                    attempt.rollback(
                      event.signal.aborted ? 'Aborted' : 'Failed',
                      renderResult.value.rollback,
                    ),
                  ).pipe(Effect.ensuring(resource.release))
                : Effect.void,
            ),
          ),
        );
        navigationOutcome.resolve({
          _tag: 'Committed',
          redirected,
          rendererNavigation: renderResult.value,
          resolvedDestination,
          resource,
        });
      });

      // oxlint-disable-next-line effecttsgo/async-function -- React Transition Actions are a native Promise boundary.
      startTransition(async () => {
        await run(navigationAction, { signal: event.signal }).catch(navigationOutcome.reject);
      });

      const outcome = await navigationOutcome.promise.catch((cause) => {
        if (!event.signal.aborted) {
          throw cause;
        }
        return { _tag: 'Handled' } as NavigationOutcome;
      });
      if (outcome._tag === 'Handled') {
        return;
      }

      const { redirected, rendererNavigation, resolvedDestination, resource } = outcome;
      const committedEntry = Promise.withResolvers<NavigationHistoryEntry | null>();
      const trackFlight = Effect.gen(function* () {
        const flightOutcome = yield* Effect.raceFirst(
          resource.completed.pipe(Effect.as('Completed' as const)),
          Effect.promise(() => rendererNavigation.retired).pipe(Effect.as('Retired' as const)),
        );
        if (flightOutcome === 'Retired') {
          return;
        }

        const entry = yield* Effect.promise(() => committedEntry.promise);
        if (entry !== null) {
          yield* Effect.sync(() => resource.cache(entry));
        }
      }).pipe(Effect.ignore, Effect.ensuring(resource.release));

      void run(trackFlight).catch(() => undefined);

      if (redirected && precommitController !== undefined) {
        precommitController.redirect(resolvedDestination.href, { history: 'auto' });
      }
      if (precommitController === undefined) {
        committedEntry.resolve(navigationApi.getCurrentEntry());
      } else {
        precommitController.addHandler(() => {
          committedEntry.resolve(navigationApi.getCurrentEntry());
        });
      }
    };

    event.intercept(
      event.cancelable
        ? { precommitHandler: handler }
        : {
            // Browsers make some traversals non-cancelable so an application cannot trap users.
            handler,
          },
    );
  };

  yield* Effect.acquireRelease(
    Effect.sync(() => navigationApi.subscribe(onNavigate)),
    (unsubscribe) => Effect.sync(unsubscribe),
  );
});
