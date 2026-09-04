import { Effect, Exit, MutableRef } from 'effect';
import { addTransitionType, startTransition } from 'react';

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

const getNavigationTransitionTypes = (
  event: NavigateEvent,
  fromIndex: number | null,
): ReadonlyArray<string> => {
  const types = [
    'navigation',
    `navigation-${event.navigationType}`,
    ...(event.hasUAVisualTransition ? ['navigation-ua-visual-transition'] : []),
  ];
  if (event.navigationType === 'push') {
    return [...types, 'navigation-forward'];
  }
  if (event.navigationType !== 'traverse') {
    return types;
  }

  if (fromIndex === null || fromIndex === event.destination.index) {
    return types;
  }
  return [
    ...types,
    event.destination.index < fromIndex ? 'navigation-backward' : 'navigation-forward',
  ];
};

type NavigationEntryState =
  | { readonly _tag: 'PendingCommit' }
  | {
      readonly _tag: 'Committed';
      readonly entry: NavigationHistoryEntry | null;
    };

type NavigationFlightState =
  | { readonly _tag: 'Streaming'; readonly resource: RouteResource }
  | { readonly _tag: 'Completed'; readonly cache: RouteResource['cache'] };

type NavigationCandidate =
  | {
      readonly _tag: 'Loading';
      readonly generation: NavigationGeneration;
      readonly lifetime: AbortController;
    }
  | {
      readonly _tag: 'Publishing';
      readonly generation: NavigationGeneration;
      readonly lifetime: AbortController;
      readonly resource: RouteResource;
    }
  | {
      readonly _tag: 'Rendering';
      readonly generation: NavigationGeneration;
      readonly lifetime: AbortController;
      readonly rendererNavigation: BrowserRendererNavigation;
      readonly resource: RouteResource;
    };

type VisibleNavigation =
  | { readonly _tag: 'Settled' }
  | {
      readonly _tag: 'Navigation';
      readonly entry: NavigationEntryState;
      readonly flight: NavigationFlightState;
      readonly generation: NavigationGeneration;
    };

type RouterState =
  | { readonly _tag: 'Ready'; readonly visible: VisibleNavigation }
  | {
      readonly _tag: 'Navigating';
      readonly candidate: NavigationCandidate;
      readonly visible: VisibleNavigation;
    };

type RouterEvent =
  | {
      readonly _tag: 'BeginNavigation';
      readonly generation: NavigationGeneration;
      readonly lifetime: AbortController;
    }
  | { readonly _tag: 'DocumentLoaded'; readonly generation: NavigationGeneration }
  | {
      readonly _tag: 'RouteLoaded';
      readonly generation: NavigationGeneration;
      readonly resource: RouteResource;
    }
  | {
      readonly _tag: 'RenderScheduled';
      readonly generation: NavigationGeneration;
      readonly rendererNavigation: BrowserRendererNavigation;
      readonly resource: RouteResource;
    }
  | { readonly _tag: 'RenderCommitted'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'RenderRetired'; readonly generation: NavigationGeneration }
  | {
      readonly _tag: 'HistoryCommitted';
      readonly entry: NavigationHistoryEntry | null;
      readonly generation: NavigationGeneration;
    }
  | { readonly _tag: 'FlightCompleted'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'FlightFailed'; readonly generation: NavigationGeneration }
  | { readonly _tag: 'NavigationAborted'; readonly generation: NavigationGeneration };

type RouterCommand =
  | { readonly _tag: 'SupersedeCandidate'; readonly candidate: NavigationCandidate }
  | {
      readonly _tag: 'PublishRoute';
      readonly generation: NavigationGeneration;
      readonly resource: RouteResource;
    }
  | { readonly _tag: 'ReleaseRoute'; readonly resource: RouteResource }
  | {
      readonly _tag: 'CacheRoute';
      readonly cache: RouteResource['cache'];
      readonly entry: NavigationHistoryEntry;
    }
  | {
      readonly _tag: 'CacheAndReleaseRoute';
      readonly entry: NavigationHistoryEntry;
      readonly resource: RouteResource;
    }
  | {
      readonly _tag: 'DiscardRoute';
      readonly rendererNavigation: BrowserRendererNavigation;
      readonly resource: RouteResource;
    };

type RouterTransition = {
  readonly command: RouterCommand | null;
  readonly state: RouterState;
};

const reduceRouterState = (state: RouterState, event: RouterEvent): RouterTransition => {
  if (state.visible._tag === 'Navigation' && state.visible.generation === event.generation) {
    const visible = state.visible;
    switch (event._tag) {
      case 'RenderRetired':
        return {
          command:
            visible.flight._tag === 'Streaming'
              ? { _tag: 'ReleaseRoute', resource: visible.flight.resource }
              : null,
          state: { ...state, visible: { _tag: 'Settled' } },
        };
      case 'HistoryCommitted':
        if (visible.entry._tag === 'Committed') {
          throw new TypeError('A visible navigation history entry cannot commit twice.');
        }
        if (visible.flight._tag === 'Streaming') {
          return {
            command: null,
            state: {
              ...state,
              visible: {
                ...visible,
                entry: { _tag: 'Committed', entry: event.entry },
              },
            },
          };
        }
        return {
          command:
            event.entry === null
              ? null
              : { _tag: 'CacheRoute', cache: visible.flight.cache, entry: event.entry },
          state: { ...state, visible: { _tag: 'Settled' } },
        };
      case 'FlightCompleted':
        if (visible.flight._tag === 'Completed') {
          throw new TypeError('A visible navigation Flight stream cannot complete twice.');
        }
        if (visible.entry._tag === 'PendingCommit') {
          return {
            command: { _tag: 'ReleaseRoute', resource: visible.flight.resource },
            state: {
              ...state,
              visible: {
                ...visible,
                flight: { _tag: 'Completed', cache: visible.flight.resource.cache },
              },
            },
          };
        }
        return {
          command:
            visible.entry.entry === null
              ? { _tag: 'ReleaseRoute', resource: visible.flight.resource }
              : {
                  _tag: 'CacheAndReleaseRoute',
                  entry: visible.entry.entry,
                  resource: visible.flight.resource,
                },
          state: { ...state, visible: { _tag: 'Settled' } },
        };
      case 'FlightFailed':
        if (visible.flight._tag === 'Completed') {
          throw new TypeError('A completed visible Flight stream cannot fail.');
        }
        return {
          command: { _tag: 'ReleaseRoute', resource: visible.flight.resource },
          state: { ...state, visible: { _tag: 'Settled' } },
        };
    }
  }

  if (
    event._tag === 'RenderRetired' ||
    event._tag === 'HistoryCommitted' ||
    event._tag === 'FlightCompleted'
  ) {
    return { command: null, state };
  }

  if (event._tag === 'BeginNavigation') {
    const nextState: RouterState = {
      _tag: 'Navigating',
      candidate: {
        _tag: 'Loading',
        generation: event.generation,
        lifetime: event.lifetime,
      },
      visible: state.visible,
    };
    if (state._tag === 'Ready') {
      return { command: null, state: nextState };
    }
    return {
      command: { _tag: 'SupersedeCandidate', candidate: state.candidate },
      state: nextState,
    };
  }

  if (state._tag === 'Ready' || state.candidate.generation !== event.generation) {
    switch (event._tag) {
      case 'RouteLoaded':
        return { command: { _tag: 'ReleaseRoute', resource: event.resource }, state };
      case 'RenderScheduled':
        return {
          command: {
            _tag: 'DiscardRoute',
            rendererNavigation: event.rendererNavigation,
            resource: event.resource,
          },
          state,
        };
      default:
        return { command: null, state };
    }
  }

  switch (event._tag) {
    case 'DocumentLoaded':
    case 'FlightFailed':
      if (state.candidate._tag !== 'Loading') {
        throw new TypeError(`${event._tag} cannot follow ${state.candidate._tag}.`);
      }
      return { command: null, state: { _tag: 'Ready', visible: state.visible } };
    case 'RouteLoaded':
      if (state.candidate._tag !== 'Loading') {
        throw new TypeError(`RouteLoaded cannot follow ${state.candidate._tag}.`);
      }
      return {
        command: {
          _tag: 'PublishRoute',
          generation: event.generation,
          resource: event.resource,
        },
        state: {
          _tag: 'Navigating',
          candidate: {
            _tag: 'Publishing',
            generation: event.generation,
            lifetime: state.candidate.lifetime,
            resource: event.resource,
          },
          visible: state.visible,
        },
      };
    case 'RenderScheduled':
      if (state.candidate._tag !== 'Publishing') {
        throw new TypeError(`RenderScheduled cannot follow ${state.candidate._tag}.`);
      }
      if (state.candidate.resource !== event.resource) {
        throw new TypeError('RenderScheduled must use the published route resource.');
      }
      return {
        command: null,
        state: {
          _tag: 'Navigating',
          candidate: {
            _tag: 'Rendering',
            generation: event.generation,
            lifetime: state.candidate.lifetime,
            rendererNavigation: event.rendererNavigation,
            resource: event.resource,
          },
          visible: state.visible,
        },
      };
    case 'RenderCommitted':
      if (state.candidate._tag !== 'Rendering') {
        throw new TypeError(`RenderCommitted cannot follow ${state.candidate._tag}.`);
      }
      return {
        command: null,
        state: {
          _tag: 'Ready',
          visible: {
            _tag: 'Navigation',
            entry: { _tag: 'PendingCommit' },
            flight: { _tag: 'Streaming', resource: state.candidate.resource },
            generation: event.generation,
          },
        },
      };
    case 'NavigationAborted':
      if (state.candidate._tag === 'Loading') {
        return { command: null, state: { _tag: 'Ready', visible: state.visible } };
      }
      if (state.candidate._tag === 'Publishing') {
        return {
          command: { _tag: 'ReleaseRoute', resource: state.candidate.resource },
          state: { _tag: 'Ready', visible: state.visible },
        };
      }
      return {
        command: {
          _tag: 'DiscardRoute',
          rendererNavigation: state.candidate.rendererNavigation,
          resource: state.candidate.resource,
        },
        state: { _tag: 'Ready', visible: state.visible },
      };
  }
};

type NavigationPreparation =
  | { readonly _tag: 'Handled' }
  | {
      readonly _tag: 'Rendered';
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

  const executeRouterCommand = Effect.fnUntraced(function* (command: RouterCommand | null) {
    if (command === null) {
      return;
    }
    switch (command._tag) {
      case 'SupersedeCandidate': {
        const candidate = command.candidate;
        yield* Effect.sync(() => candidate.lifetime.abort());
        if (candidate._tag === 'Loading') {
          break;
        }
        if (candidate._tag === 'Publishing') {
          yield* candidate.resource.release;
          break;
        }
        yield* Effect.promise(() => candidate.rendererNavigation.discard()).pipe(
          Effect.ensuring(candidate.resource.release),
        );
        break;
      }
      case 'ReleaseRoute':
        yield* command.resource.release;
        break;
      case 'CacheRoute':
        yield* Effect.sync(() => command.cache(command.entry));
        break;
      case 'CacheAndReleaseRoute':
        yield* Effect.sync(() => command.resource.cache(command.entry));
        yield* command.resource.release;
        break;
      case 'DiscardRoute':
        yield* Effect.promise(() => command.rendererNavigation.discard()).pipe(
          Effect.ensuring(command.resource.release),
        );
        break;
      default:
        throw new TypeError(`Cannot execute the ${command._tag} lifecycle command here.`);
    }
  });

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
    const lifetime = new AbortController();
    const navigationSignal = AbortSignal.any([event.signal, lifetime.signal]);
    const begin = dispatch({
      _tag: 'BeginNavigation',
      generation,
      lifetime,
    });
    void run(executeRouterCommand(begin.command)).catch(() => undefined);
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

        if (
          destination.href !== resolvedDestination.href &&
          (precommitController === undefined || event.navigationType === 'traverse')
        ) {
          dispatch({ _tag: 'DocumentLoaded', generation });
          yield* resource.release;
          navigationApi.replaceDocument(resolvedDestination.href);
          return { _tag: 'Handled' } as const;
        }

        const transition = dispatch({ _tag: 'RouteLoaded', generation, resource });
        const command = transition.command;
        if (command?._tag === 'ReleaseRoute') {
          yield* command.resource.release;
          return { _tag: 'Handled' } as const;
        }
        if (command?._tag === 'PublishRoute') {
          const rendererNavigation = yield* Effect.sync(() => {
            let navigation!: BrowserRendererNavigation;
            startTransition(() => {
              const fromIndex =
                navigationApi.getTransition()?.from.index ??
                navigationApi.getCurrentEntry()?.index ??
                null;
              for (const type of getNavigationTransitionTypes(event, fromIndex)) {
                addTransitionType(type);
              }
              navigation = browserRenderer.navigate(command.resource.routeTree);
            });
            return navigation;
          });
          const scheduled = dispatch({
            _tag: 'RenderScheduled',
            generation: command.generation,
            rendererNavigation,
            resource: command.resource,
          });
          if (scheduled.command !== null) {
            yield* executeRouterCommand(scheduled.command);
            return { _tag: 'Handled' } as const;
          }
          return {
            _tag: 'Rendered',
            rendererNavigation,
            resolvedDestination,
            resource: command.resource,
          } as const;
        }

        throw new TypeError('A loaded route must be published or released.');
      });

      // oxlint-disable-next-line effecttsgo/async-function -- React Transition Actions are a native Promise boundary.
      startTransition(async () => {
        await run(navigationAction, { signal: navigationSignal })
          .then(preparation.resolve)
          .catch(preparation.reject);
      });

      const abortNavigation = Effect.suspend(() => {
        const transition = dispatch({ _tag: 'NavigationAborted', generation });
        return executeRouterCommand(transition.command);
      });
      const outcome = await preparation.promise.catch((cause) => {
        if (navigationSignal.aborted) {
          return run(abortNavigation.pipe(Effect.as({ _tag: 'Handled' } as NavigationPreparation)));
        }
        if (!event.cancelable && event.navigationType === 'traverse') {
          navigationApi.reloadDocument();
          return { _tag: 'Handled' } as NavigationPreparation;
        }
        throw cause;
      });
      if (outcome._tag === 'Handled') {
        return;
      }

      const { rendererNavigation, resolvedDestination, resource } = outcome;
      const waitForNavigationCommit = Effect.uninterruptibleMask((restore) =>
        restore(Effect.promise(() => rendererNavigation.committed)).pipe(
          Effect.tap(
            Effect.suspend(() => {
              const transition = dispatch({
                _tag: 'RenderCommitted',
                generation,
              });
              return executeRouterCommand(transition.command);
            }),
          ),
          Effect.onExit((exit) => (Exit.isFailure(exit) ? abortNavigation : Effect.void)),
        ),
      );
      try {
        await run(waitForNavigationCommit, { signal: navigationSignal });
      } catch (cause) {
        if (navigationSignal.aborted) {
          return;
        }
        throw cause;
      }

      const waitForRenderRetirement = Effect.gen(function* () {
        yield* Effect.promise(() => rendererNavigation.retired);
        const transition = dispatch({ _tag: 'RenderRetired', generation });
        yield* executeRouterCommand(transition.command);
      }).pipe(Effect.ignore);
      void run(waitForRenderRetirement).catch(() => undefined);

      const waitForFlightCompletion = Effect.gen(function* () {
        const flightExit = yield* Effect.exit(resource.completed);
        const transition = dispatch({
          _tag: Exit.isSuccess(flightExit) ? 'FlightCompleted' : 'FlightFailed',
          generation,
        });
        yield* executeRouterCommand(transition.command);
      });
      void run(waitForFlightCompletion).catch(() => undefined);

      if (destination.href !== resolvedDestination.href && precommitController !== undefined) {
        precommitController.redirect(resolvedDestination.href, { history: 'auto' });
      }
      const commitHistory = Effect.suspend(() => {
        const transition = dispatch({
          _tag: 'HistoryCommitted',
          entry: navigationApi.getCurrentEntry(),
          generation,
        });
        return executeRouterCommand(transition.command);
      });
      if (precommitController === undefined) {
        await run(commitHistory);
      } else {
        precommitController.addHandler(() => run(commitHistory));
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
