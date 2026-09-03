import { Effect, Exit, MutableRef } from 'effect';
import { startTransition } from 'react';

import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderer, type BrowserRendererNavigation } from './browser-renderer';
import { NavigationApi } from './navigation-api';
import {
  isRoutedNavigation,
  NativeDocumentNavigationInfo,
  preserveRequestedHash,
} from './navigation-routing';
import { RouteLoader, type RouteLoad } from './route-loader';

type NavigationGeneration = symbol;

type NavigationCandidate =
  | { readonly _tag: 'Loading'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'Rendering'; readonly generation: NavigationGeneration };

type RouterState =
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Navigating'; readonly candidate: NavigationCandidate };

type RouterEvent =
  | { readonly _tag: 'BeginCancelable'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'BeginCommittedTraversal'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'RouteLoaded'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'RenderCommitted'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'FlightFailed'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'NavigationAborted'; readonly generation: NavigationGeneration };

type RouterTransition =
  | { readonly _tag: 'Continue'; readonly state: RouterState }
  | { readonly _tag: 'Render'; readonly state: RouterState }
  | { readonly _tag: 'Discard'; readonly state: RouterState };

type NavigationRenderResult<Render> =
  | { readonly _tag: 'Rendered'; readonly value: Render }
  | { readonly _tag: 'Discarded' };

type NavigationAttempt = {
  readonly abort: (discardRender: () => Promise<void>) => Promise<void>;
  readonly complete: () => void;
  readonly fail: () => void;
  readonly render: <Render>(render: () => Render) => NavigationRenderResult<Render>;
};

const reduceRouterState = (state: RouterState, event: RouterEvent): RouterTransition => {
  if (event._tag === 'BeginCancelable' || event._tag === 'BeginCommittedTraversal') {
    return {
      _tag: 'Continue',
      state: {
        _tag: 'Navigating',
        candidate: { _tag: 'Loading', generation: event.generation },
      },
    };
  }

  if (state._tag === 'Ready' || state.candidate.generation !== event.generation) {
    return {
      _tag: event._tag === 'RouteLoaded' ? 'Discard' : 'Continue',
      state,
    };
  }

  switch (event._tag) {
    case 'FlightFailed':
      return state.candidate._tag === 'Loading'
        ? { _tag: 'Continue', state: { _tag: 'Ready' } }
        : { _tag: 'Continue', state };
    case 'RouteLoaded':
      return state.candidate._tag === 'Loading'
        ? {
            _tag: 'Render',
            state: {
              _tag: 'Navigating',
              candidate: { _tag: 'Rendering', generation: event.generation },
            },
          }
        : { _tag: 'Discard', state };
    case 'RenderCommitted':
      return state.candidate._tag === 'Rendering'
        ? { _tag: 'Continue', state: { _tag: 'Ready' } }
        : { _tag: 'Continue', state };
    case 'NavigationAborted':
      return { _tag: 'Continue', state: { _tag: 'Ready' } };
  }
};

type NavigationPreparation =
  | { readonly _tag: 'Handled' }
  | {
      readonly _tag: 'Rendered';
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
  const routerState = MutableRef.make<RouterState>({ _tag: 'Ready' });

  const dispatch = (event: RouterEvent) => {
    const transition = reduceRouterState(MutableRef.get(routerState), event);
    MutableRef.set(routerState, transition.state);
    return transition;
  };

  const beginNavigation = (event: NavigateEvent): NavigationAttempt => {
    const generation: NavigationGeneration = Symbol('NavigationGeneration');
    dispatch({
      _tag: event.cancelable ? 'BeginCancelable' : 'BeginCommittedTraversal',
      generation,
    });

    // oxlint-disable-next-line effecttsgo/async-function -- React render retirement is a native Promise boundary.
    const abort = async (discardRender: () => Promise<void>) => {
      await discardRender();
      dispatch({ _tag: 'NavigationAborted', generation });
    };

    return {
      abort,
      complete: () => {
        dispatch({ _tag: 'RenderCommitted', generation });
      },
      fail: () => {
        dispatch({ _tag: 'FlightFailed', generation });
      },
      render: (render) => {
        const transition = dispatch({ _tag: 'RouteLoaded', generation });
        if (transition._tag === 'Discard') {
          return { _tag: 'Discarded' };
        }
        if (transition._tag !== 'Render') {
          throw new TypeError('An active loading navigation must accept its render.');
        }
        return { _tag: 'Rendered', value: render() };
      },
    };
  };

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
    if (!isRoutedNavigation(event)) {
      return;
    }

    const destination = new URL(event.destination.url);
    const attempt = beginNavigation(event);
    // oxlint-disable-next-line effecttsgo/async-function -- Navigation handlers are native Promise boundaries.
    const handler = async (precommitController?: NavigationPrecommitController) => {
      const preparation = Promise.withResolvers<NavigationPreparation>();

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
          return { _tag: 'Handled' } as const;
        }

        const resolvedDestination = preserveRequestedHash(destination, resource.resolvedUrl);
        if (resolvedDestination.origin !== destination.origin) {
          yield* resource.release;
          openDocument(event, resolvedDestination);
          return { _tag: 'Handled' } as const;
        }

        const redirected = destination.href !== resolvedDestination.href;
        if (
          redirected &&
          (precommitController === undefined || event.navigationType === 'traverse')
        ) {
          yield* resource.release;
          navigationApi.replaceDocument(resolvedDestination.href);
          return { _tag: 'Handled' } as const;
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
          return { _tag: 'Handled' } as const;
        }

        return {
          _tag: 'Rendered',
          redirected,
          rendererNavigation: renderResult.value,
          resolvedDestination,
          resource,
        } as const;
      });

      // oxlint-disable-next-line effecttsgo/async-function -- React Transition Actions are a native Promise boundary.
      startTransition(async () => {
        await run(navigationAction, { signal: event.signal })
          .then(preparation.resolve)
          .catch(preparation.reject);
      });

      const outcome = await preparation.promise.catch((cause) => {
        if (!event.signal.aborted) {
          throw cause;
        }
        return { _tag: 'Handled' } as NavigationPreparation;
      });
      if (outcome._tag === 'Handled') {
        return;
      }

      const { redirected, rendererNavigation, resolvedDestination, resource } = outcome;
      const waitForNavigationCommit = Effect.uninterruptibleMask((restore) =>
        restore(Effect.promise(() => rendererNavigation.committed)).pipe(
          Effect.tap(Effect.sync(attempt.complete)),
          Effect.onExit((exit) =>
            Exit.isFailure(exit)
              ? Effect.promise(() => attempt.abort(rendererNavigation.discard)).pipe(
                  Effect.ensuring(resource.release),
                )
              : Effect.void,
          ),
        ),
      );
      try {
        await run(waitForNavigationCommit, { signal: event.signal });
      } catch (cause) {
        if (event.signal.aborted) {
          return;
        }
        throw cause;
      }

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
