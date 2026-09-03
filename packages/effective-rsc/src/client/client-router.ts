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
type RouteResource = Extract<RouteLoad, { readonly _tag: 'Route' }>;

type NavigationCandidate =
  | { readonly _tag: 'Loading'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'Rendering'; readonly generation: NavigationGeneration };

type VisibleNavigation =
  | { readonly _tag: 'Settled' }
  | {
      readonly _tag: 'Navigation';
      readonly generation: NavigationGeneration;
      readonly rendererNavigation: BrowserRendererNavigation;
    };

type RouterState =
  | { readonly _tag: 'Ready'; readonly visible: VisibleNavigation }
  | {
      readonly _tag: 'Navigating';
      readonly candidate: NavigationCandidate;
      readonly visible: VisibleNavigation;
    };

type RouterEvent =
  | { readonly _tag: 'BeginCancelable'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'BeginCommittedTraversal'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'DocumentLoaded'; readonly generation: NavigationGeneration }
  | {
      readonly _tag: 'RouteLoaded';
      readonly generation: NavigationGeneration;
      readonly resource: RouteResource;
    }
  | {
      readonly _tag: 'RenderCommitted';
      readonly generation: NavigationGeneration;
      readonly rendererNavigation: BrowserRendererNavigation;
    }
  | { readonly _tag: 'RenderRetired'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'FlightFailed'; readonly generation: NavigationGeneration }
  | {
      readonly _tag: 'NavigationAborted';
      readonly generation: NavigationGeneration;
      readonly rendererNavigation: BrowserRendererNavigation;
      readonly resource: RouteResource;
    };

type RouterCommand =
  | { readonly _tag: 'PublishRoute'; readonly resource: RouteResource }
  | { readonly _tag: 'ReleaseRoute'; readonly resource: RouteResource }
  | {
      readonly _tag: 'DiscardRoute';
      readonly rendererNavigation: BrowserRendererNavigation;
      readonly resource: RouteResource;
    };

type RouterTransition = {
  readonly state: RouterState;
  readonly commands: ReadonlyArray<RouterCommand>;
};

const reduceRouterState = (state: RouterState, event: RouterEvent): RouterTransition => {
  if (event._tag === 'RenderRetired') {
    if (state.visible._tag === 'Settled' || state.visible.generation !== event.generation) {
      return { commands: [], state };
    }
    return {
      commands: [],
      state: { ...state, visible: { _tag: 'Settled' } },
    };
  }

  if (event._tag === 'BeginCancelable' || event._tag === 'BeginCommittedTraversal') {
    return {
      commands: [],
      state: {
        _tag: 'Navigating',
        candidate: { _tag: 'Loading', generation: event.generation },
        visible: state.visible,
      },
    };
  }

  if (state._tag === 'Ready' || state.candidate.generation !== event.generation) {
    switch (event._tag) {
      case 'RouteLoaded':
        return { commands: [{ _tag: 'ReleaseRoute', resource: event.resource }], state };
      case 'NavigationAborted':
        return {
          commands: [
            {
              _tag: 'DiscardRoute',
              rendererNavigation: event.rendererNavigation,
              resource: event.resource,
            },
          ],
          state,
        };
      default:
        return { commands: [], state };
    }
  }

  switch (event._tag) {
    case 'DocumentLoaded':
    case 'FlightFailed':
      return state.candidate._tag === 'Loading'
        ? { commands: [], state: { _tag: 'Ready', visible: state.visible } }
        : { commands: [], state };
    case 'RouteLoaded':
      return state.candidate._tag === 'Loading'
        ? {
            commands: [{ _tag: 'PublishRoute', resource: event.resource }],
            state: {
              _tag: 'Navigating',
              candidate: { _tag: 'Rendering', generation: event.generation },
              visible: state.visible,
            },
          }
        : { commands: [{ _tag: 'ReleaseRoute', resource: event.resource }], state };
    case 'RenderCommitted':
      return state.candidate._tag === 'Rendering'
        ? {
            commands: [],
            state: {
              _tag: 'Ready',
              visible: {
                _tag: 'Navigation',
                generation: event.generation,
                rendererNavigation: event.rendererNavigation,
              },
            },
          }
        : { commands: [], state };
    case 'NavigationAborted':
      return {
        commands: [
          {
            _tag: 'DiscardRoute',
            rendererNavigation: event.rendererNavigation,
            resource: event.resource,
          },
        ],
        state: { _tag: 'Ready', visible: state.visible },
      };
  }
};

type NavigationPreparation =
  | { readonly _tag: 'Handled' }
  | {
      readonly _tag: 'Rendered';
      readonly redirected: boolean;
      readonly rendererNavigation: BrowserRendererNavigation;
      readonly resolvedDestination: URL;
      readonly resource: RouteResource;
    };

export const installClientRouter = Effect.gen(function* () {
  const browserRenderer = yield* BrowserRenderer;
  const navigationApi = yield* NavigationApi;
  const routeLoader = yield* RouteLoader;
  const run = yield* BrowserEffectRunner;
  const routerState = MutableRef.make<RouterState>({
    _tag: 'Ready',
    visible: { _tag: 'Settled' },
  });

  const dispatch = (event: RouterEvent) => {
    const transition = reduceRouterState(MutableRef.get(routerState), event);
    MutableRef.set(routerState, transition.state);
    return transition;
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
    const generation: NavigationGeneration = Symbol('NavigationGeneration');
    dispatch({
      _tag: event.cancelable ? 'BeginCancelable' : 'BeginCommittedTraversal',
      generation,
    });
    // oxlint-disable-next-line effecttsgo/async-function -- Navigation handlers are native Promise boundaries.
    const handler = async (precommitController?: NavigationPrecommitController) => {
      const preparation = Promise.withResolvers<NavigationPreparation>();

      const navigationAction = Effect.gen(function* () {
        const resource = yield* routeLoader
          .load({
            destination: event.destination,
            navigationType: event.navigationType,
          })
          .pipe(
            Effect.onError(() =>
              Effect.sync(() => {
                dispatch({ _tag: 'FlightFailed', generation });
              }),
            ),
          );

        if (resource._tag === 'Document') {
          dispatch({ _tag: 'DocumentLoaded', generation });
          yield* resource.release;
          openDocument(event, destination);
          return { _tag: 'Handled' } as const;
        }

        const resolvedDestination = preserveRequestedHash(destination, resource.resolvedUrl);
        if (resolvedDestination.origin !== destination.origin) {
          dispatch({ _tag: 'DocumentLoaded', generation });
          yield* resource.release;
          openDocument(event, resolvedDestination);
          return { _tag: 'Handled' } as const;
        }

        const redirected = destination.href !== resolvedDestination.href;
        if (
          redirected &&
          (precommitController === undefined || event.navigationType === 'traverse')
        ) {
          dispatch({ _tag: 'DocumentLoaded', generation });
          yield* resource.release;
          navigationApi.replaceDocument(resolvedDestination.href);
          return { _tag: 'Handled' } as const;
        }

        const transition = dispatch({ _tag: 'RouteLoaded', generation, resource });
        for (const command of transition.commands) {
          if (command._tag === 'ReleaseRoute') {
            yield* command.resource.release;
            return { _tag: 'Handled' } as const;
          }
          if (command._tag === 'PublishRoute') {
            const rendererNavigation = yield* Effect.sync(() => {
              let navigation!: BrowserRendererNavigation;
              startTransition(() => {
                navigation = browserRenderer.navigate(command.resource.routeTree);
              });
              return navigation;
            });
            return {
              _tag: 'Rendered',
              redirected,
              rendererNavigation,
              resolvedDestination,
              resource: command.resource,
            } as const;
          }
        }

        throw new TypeError('A loaded route must be published or released.');
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
      const discardAbortedNavigation = Effect.suspend(() => {
        const transition = dispatch({
          _tag: 'NavigationAborted',
          generation,
          rendererNavigation,
          resource,
        });
        for (const command of transition.commands) {
          if (command._tag === 'DiscardRoute') {
            return Effect.promise(() => command.rendererNavigation.discard()).pipe(
              Effect.ensuring(command.resource.release),
            );
          }
        }
        return Effect.die(
          new TypeError('An aborted rendered route must be discarded and released.'),
        );
      });
      const waitForNavigationCommit = Effect.uninterruptibleMask((restore) =>
        restore(Effect.promise(() => rendererNavigation.committed)).pipe(
          Effect.tap(
            Effect.sync(() => {
              dispatch({ _tag: 'RenderCommitted', generation, rendererNavigation });
            }),
          ),
          Effect.onExit((exit) => (Exit.isFailure(exit) ? discardAbortedNavigation : Effect.void)),
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

      const waitForRenderRetirement = Effect.promise(() => rendererNavigation.retired).pipe(
        Effect.tap(
          Effect.sync(() => {
            dispatch({ _tag: 'RenderRetired', generation });
          }),
        ),
        Effect.ignore,
      );
      void run(waitForRenderRetirement).catch(() => undefined);

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
