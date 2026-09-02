import { expect, it } from '@effect/vitest';
import { Deferred, Effect } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import { vi } from 'vitest';

vi.mock('react-server-dom-rspack/client.browser', () => ({
  createFromReadableStream: vi.fn(),
}));

import { BrowserEffectRunner } from '../../src/client/browser-effect-runner';
import { BrowserNavigation } from '../../src/client/browser-navigation';
import type { BrowserRenderer } from '../../src/client/browser-renderer';
import type { NavigationResources } from '../../src/client/navigation-resource';
import { makeBrowserRefresh } from '../../src/dev/browser-refresh';
import type { RouteTreeModel } from '../../src/rsc/route-tree';

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
  navigate = vi.fn();
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

const makeBrowserNavigation = (navigation: TestNavigation) => ({
  location: {
    href: entry.url,
    reload: vi.fn(),
    replace: vi.fn(),
  } as unknown as Location,
  navigation: navigation as unknown as Navigation,
});

const testHttpClient = HttpClient.make(() => Effect.die('Unexpected HTTP request.'));

const withBrowserRefresh = <A, E>(
  navigation: TestNavigation,
  browserRenderer: BrowserRenderer,
  navigationResources: NavigationResources,
  test: (refresh: Effect.Effect<void>) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const run = yield* BrowserEffectRunner.make;
      const { refreshCurrentRoute } = yield* makeBrowserRefresh(
        browserRenderer,
        navigationResources,
      ).pipe(
        Effect.provideService(BrowserNavigation, makeBrowserNavigation(navigation)),
        Effect.provideService(BrowserEffectRunner, run),
      );
      return yield* test(refreshCurrentRoute);
    }).pipe(Effect.provideService(HttpClient.HttpClient, testHttpClient)),
  );

it.effect('waits for the active NavigationTransition before refreshing the current entry', () =>
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
    const navigationResources: NavigationResources = {
      invalidate: invalidated,
      load: () =>
        Deferred.succeed(loaded, undefined).pipe(
          Effect.as({
            _tag: 'Route' as const,
            cacheCurrent: () => undefined,
            completed: Effect.void,
            release: Effect.void,
            resolvedUrl: new URL(entry.url),
            routeTree: makeRouteTree('refreshed'),
          }),
        ),
      prepareRefresh: () => cached,
    };
    const browserRenderer: BrowserRenderer = {
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: (nextRouteTree) => {
        rendered.resolve(nextRouteTree);
        return Promise.resolve();
      },
    };

    yield* withBrowserRefresh(navigation, browserRenderer, navigationResources, (refresh) =>
      Effect.gen(function* () {
        yield* refresh;
        yield* Effect.yieldNow;
        expect(Deferred.isDoneUnsafe(loaded)).toBe(false);

        navigation.transition = null;
        transition.resolve();
        const nextRouteTree = yield* Effect.promise(() => rendered.promise);

        expect(nextRouteTree.id).toBe('refreshed');
        expect(invalidated).toHaveBeenCalledOnce();
        expect(navigation.navigate).not.toHaveBeenCalled();
        yield* Effect.yieldNow;
        expect(cached).toHaveBeenCalledOnce();
      }),
    );
  }),
);

it.effect('interrupts a current-route refresh when a routed navigation begins', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigation();
    const loadStarted = yield* Deferred.make<void>();
    const loadInterrupted = yield* Deferred.make<void>();
    const rootRefresh = vi.fn(() => Promise.resolve());
    const cached = vi.fn();
    const navigationResources: NavigationResources = {
      invalidate: vi.fn(),
      load: () =>
        Deferred.succeed(loadStarted, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(loadInterrupted, undefined)),
        ),
      prepareRefresh: () => cached,
    };
    const browserRenderer: BrowserRenderer = {
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: rootRefresh,
    };

    yield* withBrowserRefresh(navigation, browserRenderer, navigationResources, (refresh) =>
      Effect.gen(function* () {
        yield* refresh;
        yield* Deferred.await(loadStarted);
        navigation.dispatchEvent(routedNavigation());
        yield* Deferred.await(loadInterrupted);

        expect(rootRefresh).not.toHaveBeenCalled();
        expect(cached).not.toHaveBeenCalled();
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
    const navigationResources: NavigationResources = {
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
              cacheCurrent: () => undefined,
              completed: Effect.void,
              release: Effect.void,
              resolvedUrl: new URL(entry.url),
              routeTree: makeRouteTree('second-refresh'),
            });
      },
      prepareRefresh: () => () => undefined,
    };
    const browserRenderer: BrowserRenderer = {
      navigate: () => {
        throw new TypeError('Unexpected navigation render.');
      },
      refresh: (nextRouteTree) => {
        secondRendered.resolve(nextRouteTree);
        return Promise.resolve();
      },
    };

    yield* withBrowserRefresh(navigation, browserRenderer, navigationResources, (refresh) =>
      Effect.gen(function* () {
        yield* refresh;
        yield* Deferred.await(firstStarted);
        yield* refresh;
        yield* Deferred.await(firstInterrupted);

        const nextRouteTree = yield* Effect.promise(() => secondRendered.promise);
        expect(nextRouteTree.id).toBe('second-refresh');
        expect(loadCount).toBe(2);
      }),
    );
  }),
);
