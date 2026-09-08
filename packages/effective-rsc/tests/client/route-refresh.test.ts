import { beforeEach, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Layer } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import { vi } from 'vitest';

vi.mock('react-server-dom-rspack/client.browser', () => ({
  createFromReadableStream: vi.fn(),
}));

const react = vi.hoisted(() => ({
  transitionResults: [] as Array<unknown>,
  transitionTypes: [] as Array<string>,
}));

vi.mock('react', (importOriginal) =>
  importOriginal<typeof import('react')>().then((original) => ({
    ...original,
    startTransition: (action: Parameters<typeof original.startTransition>[0]) =>
      original.startTransition(() => {
        const result = action();
        react.transitionResults.push(result);
        return result;
      }),
    addTransitionType: (type: string) => {
      react.transitionTypes.push(type);
    },
  })),
);

import { BrowserEffectRunner } from '../../src/client/browser-effect-runner';
import { type BrowserRender, BrowserRenderer } from '../../src/client/browser-renderer';
import { FlightLoadError } from '../../src/client/flight-client';
import { NavigationApi } from '../../src/client/navigation-api';
import { RouteLoader } from '../../src/client/route-loader';
import { installRouteRefresh, RouteRefresher } from '../../src/client/route-refresh';
import type { RouteTreeModel } from '../../src/rsc/route-tree';

const committedRefresh = () => ({
  committed: Promise.resolve(),
  retired: Promise.withResolvers<void>().promise,
  discard: () => Promise.resolve(),
});

const makeRouteTree = (id: string): RouteTreeModel => ({ child: null, content: null, id });

const entry = Object.assign(new EventTarget(), {
  getState: () => undefined,
  id: 'entry-one',
  index: 0,
  key: 'entry-one',
  ondispose: null,
  sameDocument: true,
  url: 'https://effective-rsc.test/schedule/day-one',
}) satisfies NavigationHistoryEntry;

class TestNavigation extends EventTarget {
  currentEntry = entry;
  navigate = vi.fn(
    (_url: string | URL, _options?: NavigationNavigateOptions): NavigationResult => ({
      finished: Promise.resolve(entry),
    }),
  );
  reloadDocument = vi.fn();
  transition: NavigationTransition | null = null;

  entries = () => [entry];
}

const routedNavigation = () =>
  Object.assign(new Event('navigate'), {
    canIntercept: true,
    destination: {
      id: 'entry-two',
      url: 'https://effective-rsc.test/schedule/day-two',
    },
    downloadRequest: null,
    formData: null,
    hashChange: false,
    info: undefined,
    navigationType: 'push' as const,
  });

const makeNavigationApiLayer = (navigation: TestNavigation) =>
  NavigationApi.layerTest({
    getCurrentEntry: () => navigation.currentEntry,
    getCurrentUrl: () => entry.url,
    getTransition: () => navigation.transition,
    navigate: (url, options) => navigation.navigate(url, options),
    reloadDocument: navigation.reloadDocument,
    replaceDocument: vi.fn(),
    subscribe: (listener) => {
      navigation.addEventListener('navigate', listener as EventListener);
      return () => navigation.removeEventListener('navigate', listener as EventListener);
    },
  });

const testHttpClient = HttpClient.make(() => Effect.die('Unexpected HTTP request.'));

beforeEach(() => {
  react.transitionResults.length = 0;
  react.transitionTypes.length = 0;
});

it.effect('reloads the document until navigation installs streamed route refresh', () => {
  const navigation = new TestNavigation();
  const streamedRefresh = vi.fn();

  return Effect.gen(function* () {
    const routeRefresher = yield* RouteRefresher;
    yield* routeRefresher.refreshCurrentRoute('server-function');
    expect(navigation.reloadDocument).toHaveBeenCalledOnce();

    yield* routeRefresher.replace({
      interruptCurrentRouteRefresh: Effect.void,
      refreshCurrentRoute: () => Effect.sync(streamedRefresh),
    });
    yield* routeRefresher.refreshCurrentRoute('server-function');
    expect(streamedRefresh).toHaveBeenCalledOnce();
    expect(navigation.reloadDocument).toHaveBeenCalledOnce();
  }).pipe(
    Effect.provide(RouteRefresher.layer.pipe(Layer.provide(makeNavigationApiLayer(navigation)))),
  );
});

const withBrowserRefresh = <A, E>(
  navigation: TestNavigation,
  browserRenderer: BrowserRenderer['Service'],
  routeLoader: RouteLoader['Service'],
  test: (
    refresh: RouteRefresher['Service']['refreshCurrentRoute'],
    interrupt: Effect.Effect<void>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const initialized = yield* Deferred.make<RouteRefresher['Service']>();
      const navigationApiLayer = makeNavigationApiLayer(navigation);
      const routeRefresherLayer = RouteRefresher.layer.pipe(Layer.provide(navigationApiLayer));
      const servicesLayer = Layer.mergeAll(
        BrowserEffectRunner.layer,
        BrowserRenderer.layerTest(browserRenderer),
        navigationApiLayer,
        RouteLoader.layerTest(routeLoader),
        routeRefresherLayer,
      ).pipe(Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, testHttpClient)));
      const browserRefreshLayer = Layer.effectDiscard(
        Effect.gen(function* () {
          yield* installRouteRefresh;
          const routeRefresher = yield* RouteRefresher;
          yield* Deferred.succeed(initialized, routeRefresher);
        }),
      ).pipe(Layer.provideMerge(servicesLayer));
      const running = yield* Layer.launch(browserRefreshLayer).pipe(Effect.forkScoped);
      const routeRefresher = yield* Effect.raceFirst(
        Deferred.await(initialized),
        Fiber.join(running),
      );
      return yield* test(
        routeRefresher.refreshCurrentRoute,
        routeRefresher.interruptCurrentRouteRefresh,
      );
    }),
  );

it.effect('applies the HMR transition type after the active navigation settles', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const transition = Promise.withResolvers<void>();
    navigation.transition = {
      committed: Promise.resolve(),
      finished: transition.promise,
      from: entry,
      navigationType: 'replace',
    };
    const loaded = yield* Deferred.make<void>();
    const rendered = Promise.withResolvers<RouteTreeModel>();
    const invalidated = vi.fn();
    const cached = vi.fn();
    const routeLoader = RouteLoader.of({
      invalidate: invalidated,
      load: () =>
        Deferred.succeed(loaded, undefined).pipe(
          Effect.as({
            _tag: 'Route' as const,
            cache: () => undefined,
            completed: Effect.void,
            release: Effect.void,
            resolvedUrl: new URL(entry.url),
            routeTree: makeRouteTree('refreshed'),
          }),
        ),
      loadInitial: Effect.die('Unexpected initial route load.'),
      prepareRefresh: () => cached,
    });
    const browserRenderer = BrowserRenderer.of({
      commit: () => undefined,
      initialize: () => undefined,
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: (nextRouteTree) => {
        rendered.resolve(nextRouteTree);
        return committedRefresh();
      },
    });

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh) =>
      Effect.gen(function* () {
        yield* refresh('hmr-refresh');
        yield* Effect.yieldNow;
        expect(Deferred.isDoneUnsafe(loaded)).toBe(false);
        expect(react.transitionTypes).toEqual([]);

        navigation.transition = null;
        transition.resolve();
        const nextRouteTree = yield* Effect.promise(() => rendered.promise);

        expect(nextRouteTree.id).toBe('refreshed');
        expect(react.transitionTypes).toEqual(['hmr-refresh']);
        // Returning an async Action here would make React wait for its own UI commit.
        expect(react.transitionResults).toEqual([undefined]);
        expect(invalidated).toHaveBeenCalledOnce();
        expect(navigation.navigate).not.toHaveBeenCalled();
        yield* Effect.yieldNow;
        expect(cached).toHaveBeenCalledOnce();
      }),
    );
  }),
);

it.effect('leaves the current render untouched when refresh loading fails', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const loadFinished = yield* Deferred.make<void>();
    const renderRefresh = vi.fn(committedRefresh);
    const routeLoader = RouteLoader.of({
      invalidate: vi.fn(),
      load: () =>
        Effect.fail(
          new FlightLoadError({ cause: new Error('Refresh failed.'), reason: 'RequestFailed' }),
        ).pipe(Effect.ensuring(Deferred.succeed(loadFinished, undefined))),
      loadInitial: Effect.die('Unexpected initial route load.'),
      prepareRefresh: () => () => undefined,
    });
    const browserRenderer = BrowserRenderer.of({
      commit: () => undefined,
      initialize: () => undefined,
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: renderRefresh,
    });

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh) =>
      Effect.gen(function* () {
        yield* refresh('server-function');
        yield* Deferred.await(loadFinished);
        yield* Effect.yieldNow;

        expect(renderRefresh).not.toHaveBeenCalled();
      }),
    );
  }),
);

it.effect('interrupts a current-route refresh when a routed navigation begins', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const loadStarted = yield* Deferred.make<void>();
    const loadInterrupted = yield* Deferred.make<void>();
    const responseScopeClosed = yield* Deferred.make<void>();
    const rootRefresh = vi.fn(committedRefresh);
    const cached = vi.fn();
    const routeLoader = RouteLoader.of({
      invalidate: vi.fn(),
      load: () =>
        Effect.acquireRelease(Deferred.succeed(loadStarted, undefined), () =>
          Deferred.succeed(responseScopeClosed, undefined),
        ).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(loadInterrupted, undefined)),
        ),
      loadInitial: Effect.die('Unexpected initial route load.'),
      prepareRefresh: () => cached,
    });
    const browserRenderer = BrowserRenderer.of({
      commit: () => undefined,
      initialize: () => undefined,
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: rootRefresh,
    });

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh) =>
      Effect.gen(function* () {
        yield* refresh('server-function');
        yield* Deferred.await(loadStarted);
        navigation.dispatchEvent(routedNavigation());
        yield* Deferred.await(loadInterrupted);
        yield* Deferred.await(responseScopeClosed);

        expect(rootRefresh).not.toHaveBeenCalled();
        expect(cached).not.toHaveBeenCalled();
      }),
    );
  }),
);

const makeStreamingRefresh = Effect.gen(function* () {
  const streamFinished = yield* Deferred.make<void>();
  const streamReleased = yield* Deferred.make<void>();
  const responseScopeClosed = yield* Deferred.make<void>();
  const releaseStream = vi.fn();
  const cached = vi.fn();
  const refreshedTree = makeRouteTree('refreshed');
  const routeLoader = RouteLoader.of({
    invalidate: vi.fn(),
    load: () =>
      Effect.acquireRelease(
        Effect.succeed({
          _tag: 'Route' as const,
          cache: () => undefined,
          completed: Deferred.await(streamFinished),
          release: Effect.sync(releaseStream).pipe(
            Effect.andThen(Deferred.succeed(streamReleased, undefined)),
          ),
          resolvedUrl: new URL(entry.url),
          routeTree: refreshedTree,
        }),
        () => Deferred.succeed(responseScopeClosed, undefined),
      ),
    loadInitial: Effect.die('Unexpected initial route load.'),
    prepareRefresh: () => cached,
  });
  return {
    routeLoader,
    refreshedTree,
    streamFinished,
    streamReleased,
    responseScopeClosed,
    releaseStream,
    cached,
  };
});

it.effect('keeps a visible refresh stream open while the next navigation is pending', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const browserRenderer = yield* BrowserRenderer.make;
    const published = Promise.withResolvers<BrowserRender>();
    browserRenderer.initialize(makeRouteTree('initial'), published.resolve);

    const {
      routeLoader,
      refreshedTree,
      streamFinished,
      streamReleased,
      responseScopeClosed,
      releaseStream,
    } = yield* makeStreamingRefresh;

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh) =>
      Effect.gen(function* () {
        // Commit the refreshed page while its server response is still streaming.
        yield* refresh('server-function');
        const render = yield* Effect.promise(() => published.promise);
        if (render._tag !== 'Refresh') {
          return yield* Effect.die('Expected a refresh render.');
        }
        expect(render.routeTree).toBe(refreshedTree);
        browserRenderer.commit(render);
        yield* Effect.yieldNow;
        expect(releaseStream).not.toHaveBeenCalled();
        expect(Deferred.isDoneUnsafe(responseScopeClosed)).toBe(false);

        // Navigation starts, but the refreshed page stays visible until its replacement commits.
        const nextNavigation = Promise.withResolvers<void>();
        navigation.transition = {
          committed: nextNavigation.promise,
          finished: nextNavigation.promise,
          from: entry,
          navigationType: 'push',
        };
        navigation.dispatchEvent(routedNavigation());
        yield* Effect.yieldNow;

        expect(releaseStream).not.toHaveBeenCalled();
        expect(Deferred.isDoneUnsafe(responseScopeClosed)).toBe(false);

        // The visible page can finish streaming; only then may its response be released.
        yield* Deferred.succeed(streamFinished, undefined);
        yield* Deferred.await(streamReleased);
        yield* Deferred.await(responseScopeClosed);
        expect(releaseStream).toHaveBeenCalledOnce();
      }),
    );
  }),
);

it.effect('releases a streaming refresh when its replacement becomes visible', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const browserRenderer = yield* BrowserRenderer.make;
    let published = Promise.withResolvers<BrowserRender>();
    browserRenderer.initialize(makeRouteTree('initial'), (render) => published.resolve(render));
    const { routeLoader, streamReleased, responseScopeClosed, releaseStream, cached } =
      yield* makeStreamingRefresh;

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh) =>
      Effect.gen(function* () {
        yield* refresh('hmr-refresh');
        const render = yield* Effect.promise(() => published.promise);
        browserRenderer.commit(render);
        yield* Effect.yieldNow;

        // Scheduling a successor does not remove the refreshed page from the screen.
        published = Promise.withResolvers<BrowserRender>();
        navigation.dispatchEvent(routedNavigation());
        browserRenderer.navigate(makeRouteTree('replacement'));
        const replacement = yield* Effect.promise(() => published.promise);
        yield* Effect.yieldNow;
        expect(releaseStream).not.toHaveBeenCalled();

        browserRenderer.commit(replacement);
        yield* Deferred.await(streamReleased);
        yield* Deferred.await(responseScopeClosed);
        expect(releaseStream).toHaveBeenCalledOnce();
        expect(cached).not.toHaveBeenCalled();
      }),
    );
  }),
);

it.effect('discards an uncommitted refresh before releasing its response', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const browserRenderer = yield* BrowserRenderer.make;
    let published = Promise.withResolvers<BrowserRender>();
    const initialTree = makeRouteTree('initial');
    browserRenderer.initialize(initialTree, (render) => published.resolve(render));
    const { routeLoader, streamReleased, responseScopeClosed, releaseStream, cached } =
      yield* makeStreamingRefresh;

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh, interrupt) =>
      Effect.gen(function* () {
        yield* refresh('hmr-refresh');
        const pending = yield* Effect.promise(() => published.promise);
        expect(pending._tag).toBe('Refresh');

        published = Promise.withResolvers<BrowserRender>();
        yield* interrupt;
        const discard = yield* Effect.promise(() => published.promise);
        if (discard._tag !== 'Discard') {
          return yield* Effect.die('Expected a discard render.');
        }
        expect(discard.restore.routeTree).toBe(initialTree);
        expect(releaseStream).not.toHaveBeenCalled();
        expect(Deferred.isDoneUnsafe(responseScopeClosed)).toBe(false);

        // React must acknowledge the discard before the old response can be cancelled.
        browserRenderer.commit(discard);
        yield* Deferred.await(streamReleased);
        yield* Deferred.await(responseScopeClosed);
        expect(releaseStream).toHaveBeenCalledOnce();
        expect(cached).not.toHaveBeenCalled();
      }),
    );
  }),
);

it.effect('keeps response ownership when navigation interrupts refresh publication', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const browserRenderer = yield* BrowserRenderer.make;
    const discardPublished = Promise.withResolvers<BrowserRender>();
    browserRenderer.initialize(makeRouteTree('initial'), (render) => {
      if (render._tag === 'Refresh') {
        // Navigation arrives during publication, before the refresh has returned its render handle.
        navigation.dispatchEvent(routedNavigation());
      } else {
        discardPublished.resolve(render);
      }
    });
    const allowLoad = yield* Deferred.make<void>();
    const { routeLoader, responseScopeClosed, releaseStream } = yield* makeStreamingRefresh;
    const delayedLoader = RouteLoader.of({
      ...routeLoader,
      load: (request) => Deferred.await(allowLoad).pipe(Effect.andThen(routeLoader.load(request))),
    });

    yield* withBrowserRefresh(navigation, browserRenderer, delayedLoader, (refresh) =>
      Effect.gen(function* () {
        yield* refresh('hmr-refresh');
        yield* Effect.yieldNow;
        yield* Deferred.succeed(allowLoad, undefined);
        const discard = yield* Effect.promise(() => discardPublished.promise);
        expect(discard._tag).toBe('Discard');
        expect(releaseStream).not.toHaveBeenCalled();
        expect(Deferred.isDoneUnsafe(responseScopeClosed)).toBe(false);

        browserRenderer.commit(discard);
        yield* Deferred.await(responseScopeClosed);
        expect(releaseStream).toHaveBeenCalledOnce();
      }),
    );
  }),
);

it.effect('releases a visible refresh when the browser runtime shuts down', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const browserRenderer = yield* BrowserRenderer.make;
    const published = Promise.withResolvers<BrowserRender>();
    browserRenderer.initialize(makeRouteTree('initial'), published.resolve);
    const { routeLoader, responseScopeClosed, releaseStream } = yield* makeStreamingRefresh;

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh) =>
      Effect.gen(function* () {
        yield* refresh('hmr-refresh');
        const render = yield* Effect.promise(() => published.promise);
        browserRenderer.commit(render);
        yield* Effect.yieldNow;
        expect(releaseStream).not.toHaveBeenCalled();
      }),
    );

    yield* Deferred.await(responseScopeClosed);
    expect(releaseStream).toHaveBeenCalledOnce();
  }),
);

it.effect('interrupts a current-route refresh when another refresh source supersedes it', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const loadStarted = yield* Deferred.make<void>();
    const loadInterrupted = yield* Deferred.make<void>();
    const rootRefresh = vi.fn(committedRefresh);
    const routeLoader = RouteLoader.of({
      invalidate: vi.fn(),
      load: () =>
        Deferred.succeed(loadStarted, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(loadInterrupted, undefined)),
        ),
      loadInitial: Effect.die('Unexpected initial route load.'),
      prepareRefresh: () => () => undefined,
    });
    const browserRenderer = BrowserRenderer.of({
      commit: () => undefined,
      initialize: () => undefined,
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: rootRefresh,
    });

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh, interrupt) =>
      Effect.gen(function* () {
        yield* refresh('server-function');
        yield* Deferred.await(loadStarted);
        yield* interrupt;
        yield* Deferred.await(loadInterrupted);

        expect(rootRefresh).not.toHaveBeenCalled();
      }),
    );
  }),
);

it.effect('replaces an older refresh when a newer development update arrives', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const firstStarted = yield* Deferred.make<void>();
    const firstInterrupted = yield* Deferred.make<void>();
    const secondRendered = Promise.withResolvers<RouteTreeModel>();
    let loadCount = 0;
    const routeLoader = RouteLoader.of({
      invalidate: vi.fn(),
      load: () => {
        loadCount += 1;
        return loadCount === 1
          ? Deferred.succeed(firstStarted, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(firstInterrupted, undefined)),
            )
          : Effect.succeed({
              _tag: 'Route' as const,
              cache: () => undefined,
              completed: Effect.void,
              release: Effect.void,
              resolvedUrl: new URL(entry.url),
              routeTree: makeRouteTree('second-refresh'),
            });
      },
      loadInitial: Effect.die('Unexpected initial route load.'),
      prepareRefresh: () => () => undefined,
    });
    const browserRenderer = BrowserRenderer.of({
      commit: () => undefined,
      initialize: () => undefined,
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: (nextRouteTree) => {
        secondRendered.resolve(nextRouteTree);
        return committedRefresh();
      },
    });

    yield* withBrowserRefresh(navigation, browserRenderer, routeLoader, (refresh) =>
      Effect.gen(function* () {
        yield* refresh('server-function');
        yield* Deferred.await(firstStarted);
        yield* refresh('server-function');
        yield* Deferred.await(firstInterrupted);

        const nextRouteTree = yield* Effect.promise(() => secondRendered.promise);
        expect(nextRouteTree.id).toBe('second-refresh');
        expect(loadCount).toBe(2);
      }),
    );
  }),
);
