import { Effect } from 'effect';
import { startTransition } from 'react';

import { BrowserNavigation } from './browser-navigation';
import type { BrowserRenderer } from './browser-renderer';
import { ClientRuntime } from './client-runtime';
import {
  BrowserNavigationCoordinator,
  type NavigationAttempt,
  type NavigationRollbackReason,
} from './navigation-coordinator';
import type { NavigationResources } from './navigation-resource';
import {
  isHistoryRollback,
  isRoutedNavigation,
  NativeDocumentNavigationInfo,
  preserveRequestedHash,
} from './navigation-routing';

// oxlint-disable-next-line effecttsgo/async-function -- Navigation handlers are native Promise boundaries.
const ignoreNavigationAbort = async (work: Promise<void>, signal: AbortSignal) => {
  try {
    await work;
  } catch (cause) {
    if (!signal.aborted) {
      throw cause;
    }
  }
};

const startNavigationTransition = (work: () => Promise<void>) => {
  const finished = Promise.withResolvers<void>();

  // Calling work inside the transition lets React track the suspended navigation from its fetch.
  // oxlint-disable-next-line effecttsgo/async-function -- React Transition Actions are a native Promise boundary.
  startTransition(async () => {
    try {
      await work();
      finished.resolve();
    } catch (cause) {
      finished.reject(cause);
    }
  });

  return finished.promise;
};

export const listenForNavigation = Effect.fnUntraced(function* (
  browserRenderer: BrowserRenderer,
  navigationResources: NavigationResources,
) {
  const browserNavigation = yield* BrowserNavigation;
  const navigation = browserNavigation.navigation;
  const run = yield* ClientRuntime;
  const coordinator = new BrowserNavigationCoordinator(browserNavigation);

  const openDocument = (event: NavigateEvent, destination: URL) => {
    if (event.navigationType === 'traverse') {
      browserNavigation.location.replace(destination.href);
      return;
    }
    navigation.navigate(destination.href, {
      history: event.navigationType === 'replace' ? 'replace' : 'push',
      info: NativeDocumentNavigationInfo,
    });
  };

  // oxlint-disable-next-line effecttsgo/async-function -- React Transition Actions are a native Promise boundary.
  const performNavigation = async (
    attempt: NavigationAttempt,
    event: NavigateEvent,
    destination: URL,
    precommitController?: NavigationPrecommitController,
  ) => {
    const resource = await run(
      navigationResources.load({
        destination: event.destination,
        navigationType: event.navigationType,
      }),
      { signal: event.signal },
    ).catch((cause) => {
      attempt.fail();
      throw cause;
    });

    if (resource._tag === 'Document') {
      await run(resource.release);
      openDocument(event, destination);
      return;
    }

    const resolvedDestination = preserveRequestedHash(destination, resource.resolvedUrl);
    if (resolvedDestination.origin !== destination.origin) {
      await run(resource.release);
      openDocument(event, resolvedDestination);
      return;
    }

    const redirected = destination.href !== resolvedDestination.href;
    if (redirected && (precommitController === undefined || event.navigationType === 'traverse')) {
      await run(resource.release);
      browserNavigation.location.replace(resolvedDestination.href);
      return;
    }

    const renderResult = attempt.render(() => browserRenderer.navigate(resource.routeTree));
    if (renderResult._tag === 'Discarded') {
      await run(resource.release);
      return;
    }

    const rendererNavigation = renderResult.value;
    const rollbackAndRelease = (reason: NavigationRollbackReason) =>
      Effect.promise(() => attempt.rollback(reason, rendererNavigation.rollback)).pipe(
        Effect.ensuring(resource.release),
      );
    const flightCompletion = resource.completed.pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          rendererNavigation.complete();
          attempt.complete();
          resource.cacheCurrent();
        }),
      ),
    );
    const completePostcommitFlight = () =>
      ignoreNavigationAbort(
        run(
          flightCompletion.pipe(
            Effect.onError(() => rollbackAndRelease(event.signal.aborted ? 'Aborted' : 'Failed')),
          ),
          { signal: event.signal },
        ),
        event.signal,
      );

    try {
      await run(
        Effect.promise(() => rendererNavigation.committed),
        { signal: event.signal },
      );

      if (redirected && precommitController !== undefined) {
        precommitController.redirect(resolvedDestination.href, { history: 'auto' });
      }
      if (precommitController === undefined) {
        await run(flightCompletion, { signal: event.signal });
      } else {
        precommitController.addHandler(completePostcommitFlight);
      }
    } catch (cause) {
      await run(rollbackAndRelease(event.signal.aborted ? 'Aborted' : 'Failed'));
      throw cause;
    }
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
    const handler = (precommitController?: NavigationPrecommitController) =>
      startNavigationTransition(() =>
        ignoreNavigationAbort(
          performNavigation(attempt, event, destination, precommitController),
          event.signal,
        ),
      );

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
    Effect.sync(() => navigation.addEventListener('navigate', onNavigate)),
    () => Effect.sync(() => navigation.removeEventListener('navigate', onNavigate)),
  );
});
