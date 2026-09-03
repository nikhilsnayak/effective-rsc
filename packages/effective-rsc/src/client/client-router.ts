import { Effect, Exit } from 'effect';
import { startTransition } from 'react';

import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderer, type BrowserRendererNavigation } from './browser-renderer';
import { NavigationApi } from './navigation-api';
import {
  BrowserNavigationCoordinator,
  type NavigationRollbackReason,
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

        startTransition(() => {
          const renderResult = attempt.render(() => browserRenderer.navigate(resource.routeTree));
          if (renderResult._tag === 'Discarded') {
            run(resource.release).then(
              () => navigationOutcome.resolve({ _tag: 'Handled' }),
              navigationOutcome.reject,
            );
            return;
          }

          const rendererNavigation = renderResult.value;
          const rollbackAndRelease = (reason: NavigationRollbackReason) =>
            Effect.promise(() => attempt.rollback(reason, rendererNavigation.rollback)).pipe(
              Effect.ensuring(resource.release),
            );
          const commit = Effect.promise(() => rendererNavigation.committed).pipe(
            Effect.onExit((exit) =>
              Exit.isFailure(exit)
                ? rollbackAndRelease(event.signal.aborted ? 'Aborted' : 'Failed')
                : Effect.void,
            ),
          );

          run(commit, { signal: event.signal }).then(
            () =>
              navigationOutcome.resolve({
                _tag: 'Committed',
                redirected,
                rendererNavigation,
                resolvedDestination,
                resource,
              }),
            navigationOutcome.reject,
          );
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
      const rollbackAndRelease = (reason: NavigationRollbackReason) =>
        Effect.promise(() => attempt.rollback(reason, rendererNavigation.rollback)).pipe(
          Effect.ensuring(resource.release),
        );
      const completeFlight = (entry: NavigationHistoryEntry | null) =>
        resource.completed.pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              rendererNavigation.complete();
              attempt.complete();
              if (entry !== null) {
                resource.cache(entry);
              }
            }),
          ),
          Effect.onExit((exit) =>
            Exit.isFailure(exit)
              ? rollbackAndRelease(event.signal.aborted ? 'Aborted' : 'Failed')
              : Effect.void,
          ),
        );
      const completePostcommitFlight = () =>
        run(completeFlight(navigationApi.getCurrentEntry()), { signal: event.signal }).catch(
          (cause) => {
            if (!event.signal.aborted) {
              throw cause;
            }
          },
        );

      if (redirected && precommitController !== undefined) {
        precommitController.redirect(resolvedDestination.href, { history: 'auto' });
      }
      if (precommitController === undefined) {
        await completePostcommitFlight();
      } else {
        precommitController.addHandler(completePostcommitFlight);
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
