import { beforeEach, expect, it } from '@effect/vitest';
import { Deferred, Effect, Layer, MutableRef } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import { vi } from 'vitest';

import { BrowserEffectRunner } from '../../src/client/browser-effect-runner';
import { BrowserRenderer } from '../../src/client/browser-renderer';
import { FlightClient } from '../../src/client/flight-client';
import { NavigationApi } from '../../src/client/navigation-api';
import { RouteLoader } from '../../src/client/route-loader';
import { RouteRefresher } from '../../src/client/route-refresh';
import type { FlightPayload } from '../../src/rsc/flight';
import type { RouteTreeModel } from '../../src/rsc/route-tree';

type ServerCallback = (id: string, args: ReadonlyArray<unknown>) => Promise<unknown>;

const reactClient = vi.hoisted(() => ({
  serverCallback: undefined as ServerCallback | undefined,
}));

vi.mock('react-server-dom-rspack/client.browser', () => ({
  createTemporaryReferenceSet: vi.fn(() => ({})),
  encodeReply: vi.fn(() => Promise.resolve('encoded arguments')),
  setServerCallback: vi.fn((callback: ServerCallback) => {
    reactClient.serverCallback = callback;
  }),
}));

const { installCallServer } = await import('../../src/client/call-server');

const makeRouteTree = (id: string): RouteTreeModel => ({ child: null, content: null, id });

const makeNavigationEntry = (id: string, url: string) =>
  Object.assign(new EventTarget(), {
    getState: () => undefined,
    id,
    index: 0,
    key: id,
    ondispose: null,
    sameDocument: true,
    url,
  }) satisfies NavigationHistoryEntry;

const firstEntry = makeNavigationEntry('entry-one', 'https://effective-rsc.test/schedule/day-one');
const secondEntry = makeNavigationEntry('entry-two', 'https://effective-rsc.test/schedule/day-two');

const makeFlight = (id: string, value: unknown, release: Effect.Effect<void>) => ({
  _tag: 'Flight' as const,
  completed: Effect.void,
  payload: {
    formState: null,
    routeTree: makeRouteTree(id),
    serverFnResult: { _tag: 'Success' as const, value },
  } satisfies FlightPayload,
  release,
  resolvedUrl: new URL(firstEntry.url),
});

const invokeServerFn = (id: string) => {
  if (reactClient.serverCallback === undefined) {
    throw new TypeError('Expected the React Server Function callback to be installed.');
  }
  return reactClient.serverCallback(id, []);
};

beforeEach(() => {
  reactClient.serverCallback = undefined;
});

type TestNavigationState = {
  readonly currentEntry: MutableRef.MutableRef<NavigationHistoryEntry | null>;
  readonly transition: MutableRef.MutableRef<NavigationTransition | null>;
};

const staleResponseScenario = (changeNavigation: (state: TestNavigationState) => void) =>
  Effect.scoped(
    Effect.gen(function* () {
      const response = yield* Deferred.make<ReturnType<typeof makeFlight>>();
      const requestStarted = yield* Deferred.make<void>();
      const currentRouteRefresh = yield* Deferred.make<void>();
      const released = vi.fn();
      const rendered = vi.fn(() => Promise.resolve());
      const navigationState: TestNavigationState = {
        currentEntry: MutableRef.make(firstEntry),
        transition: MutableRef.make(null),
      };
      const navigationApi = NavigationApi.of({
        getCurrentEntry: () => MutableRef.get(navigationState.currentEntry),
        getCurrentUrl: () => MutableRef.get(navigationState.currentEntry)?.url ?? firstEntry.url,
        getTransition: () => MutableRef.get(navigationState.transition),
        navigate: () => {
          throw new TypeError('Unexpected navigation.');
        },
        reloadDocument: () => undefined,
        replaceDocument: () => undefined,
        subscribe: () => () => undefined,
        traverseTo: () => {
          throw new TypeError('Unexpected traversal.');
        },
      });
      const flightClient = FlightClient.of({
        load: () =>
          Deferred.succeed(requestStarted, undefined).pipe(
            Effect.andThen(Deferred.await(response)),
          ),
        loadInitial: Effect.die('Unexpected initial Flight load.'),
      });
      const browserRenderer = BrowserRenderer.of({
        commit: () => undefined,
        initialize: () => undefined,
        navigate: () => {
          throw new TypeError('Unexpected navigation render.');
        },
        refresh: rendered,
      });
      const routeLoader = RouteLoader.of({
        invalidate: () => undefined,
        load: () => Effect.die('Unexpected route load.'),
        loadInitial: Effect.die('Unexpected initial route load.'),
        prepareRefresh: () => () => undefined,
      });
      const routeRefresher = RouteRefresher.of({
        refreshCurrentRoute: Deferred.succeed(currentRouteRefresh, undefined),
        replace: () => Effect.void,
      });
      const run = yield* BrowserEffectRunner.make;

      yield* installCallServer.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(BrowserEffectRunner, run),
            Layer.succeed(BrowserRenderer, browserRenderer),
            Layer.succeed(FlightClient, flightClient),
            Layer.succeed(NavigationApi, navigationApi),
            Layer.succeed(RouteLoader, routeLoader),
            Layer.succeed(RouteRefresher, routeRefresher),
          ),
        ),
      );

      const result = invokeServerFn('first');
      yield* Deferred.await(requestStarted);
      changeNavigation(navigationState);
      yield* Deferred.succeed(response, makeFlight('stale', 'first result', Effect.sync(released)));

      const value = yield* Effect.promise(() => result);
      expect(value).toBe('first result');
      yield* Deferred.await(currentRouteRefresh);
      expect(released).toHaveBeenCalledOnce();
      expect(rendered).not.toHaveBeenCalled();
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
      ),
    ),
  );

it.effect('refreshes the current route instead of applying a response from another entry', () =>
  staleResponseScenario(({ currentEntry }) => MutableRef.set(currentEntry, secondEntry)),
);

it.effect('does not apply a Server Function response while navigation is in progress', () =>
  staleResponseScenario(({ transition }) =>
    MutableRef.set(transition, {
      committed: Promise.resolve(),
      finished: Promise.withResolvers<void>().promise,
      from: firstEntry,
      navigationType: 'push',
    }),
  ),
);

it.effect('does not let an older invocation response overwrite a newer response', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const firstResponse = yield* Deferred.make<ReturnType<typeof makeFlight>>();
      const secondResponse = yield* Deferred.make<ReturnType<typeof makeFlight>>();
      const firstStarted = yield* Deferred.make<void>();
      const secondStarted = yield* Deferred.make<void>();
      const currentRouteRefresh = yield* Deferred.make<void>();
      const directRefreshCommitted = Promise.withResolvers<void>();
      const firstReleased = vi.fn();
      const rendered: Array<string> = [];
      const navigationApi = NavigationApi.of({
        getCurrentEntry: () => firstEntry,
        getCurrentUrl: () => firstEntry.url,
        getTransition: () => null,
        navigate: () => {
          throw new TypeError('Unexpected navigation.');
        },
        reloadDocument: () => undefined,
        replaceDocument: () => undefined,
        subscribe: () => () => undefined,
        traverseTo: () => {
          throw new TypeError('Unexpected traversal.');
        },
      });
      const flightClient = FlightClient.of({
        load: (request) => {
          if (request._tag !== 'ServerFunction') {
            return Effect.die('Unexpected navigation Flight load.');
          }
          return request.id === 'first'
            ? Deferred.succeed(firstStarted, undefined).pipe(
                Effect.andThen(Deferred.await(firstResponse)),
              )
            : Deferred.succeed(secondStarted, undefined).pipe(
                Effect.andThen(Deferred.await(secondResponse)),
              );
        },
        loadInitial: Effect.die('Unexpected initial Flight load.'),
      });
      const browserRenderer = BrowserRenderer.of({
        commit: () => undefined,
        initialize: () => undefined,
        navigate: () => {
          throw new TypeError('Unexpected navigation render.');
        },
        refresh: (routeTree) => {
          rendered.push(routeTree.id);
          return Promise.resolve();
        },
      });
      const routeLoader = RouteLoader.of({
        invalidate: () => undefined,
        load: () => Effect.die('Unexpected route load.'),
        loadInitial: Effect.die('Unexpected initial route load.'),
        prepareRefresh: () => () => {
          directRefreshCommitted.resolve();
        },
      });
      const routeRefresher = RouteRefresher.of({
        refreshCurrentRoute: Deferred.succeed(currentRouteRefresh, undefined),
        replace: () => Effect.void,
      });
      const run = yield* BrowserEffectRunner.make;

      yield* installCallServer.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(BrowserEffectRunner, run),
            Layer.succeed(BrowserRenderer, browserRenderer),
            Layer.succeed(FlightClient, flightClient),
            Layer.succeed(NavigationApi, navigationApi),
            Layer.succeed(RouteLoader, routeLoader),
            Layer.succeed(RouteRefresher, routeRefresher),
          ),
        ),
      );

      const firstResult = invokeServerFn('first');
      yield* Deferred.await(firstStarted);
      const secondResult = invokeServerFn('second');
      yield* Deferred.await(secondStarted);
      yield* Deferred.succeed(secondResponse, makeFlight('newer', 'second result', Effect.void));

      const secondValue = yield* Effect.promise(() => secondResult);
      expect(secondValue).toBe('second result');
      yield* Effect.promise(() => directRefreshCommitted.promise);
      yield* Deferred.succeed(
        firstResponse,
        makeFlight('older', 'first result', Effect.sync(firstReleased)),
      );

      const firstValue = yield* Effect.promise(() => firstResult);
      expect(firstValue).toBe('first result');
      yield* Deferred.await(currentRouteRefresh);
      expect(rendered).toEqual(['newer']);
      expect(firstReleased).toHaveBeenCalledOnce();
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
      ),
    ),
  ),
);
