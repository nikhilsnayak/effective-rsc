import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Layer, Scope } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';
import { vi } from 'vitest';

vi.mock('react-server-dom-rspack/client.browser', () => ({
  createFromReadableStream: vi.fn((stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    return reader.read().then(() => {
      void reader.read().catch(() => undefined);
      return {
        formState: null,
        routeTree: {
          child: null,
          content: null,
          id: 'root',
        },
        serverFnResult: null,
      };
    });
  }),
}));

import { BrowserEffectRunner } from '../../src/client/browser-effect-runner';
import { BrowserRenderer } from '../../src/client/browser-renderer';
import { installClientRouter } from '../../src/client/client-router';
import { FlightClient } from '../../src/client/flight-client';
import { NavigationApi } from '../../src/client/navigation-api';
import { RouteLoader, type RouteLoad } from '../../src/client/route-loader';
import type { RouteTreeModel } from '../../src/rsc/route-tree';

type TestNavigateEvent = Event &
  Pick<
    NavigateEvent,
    | 'canIntercept'
    | 'destination'
    | 'downloadRequest'
    | 'formData'
    | 'hashChange'
    | 'info'
    | 'intercept'
    | 'navigationType'
    | 'signal'
  >;

const makeNavigationEntry = (key: string, url: string, id = key) =>
  Object.assign(new EventTarget(), {
    getState: () => undefined,
    id,
    index: 0,
    key,
    ondispose: null,
    sameDocument: true,
    url,
  }) satisfies NavigationHistoryEntry;

class TestNavigationApi {
  private listener: EventListener | null = null;
  readonly initialEntry = makeNavigationEntry(
    'day-one',
    'https://effective-rsc.test/schedule/day-one',
  );
  currentEntry = this.initialEntry;
  readonly nativeNavigations: Array<{
    readonly options: { readonly history: 'push' | 'replace'; readonly info: unknown };
    readonly url: string;
  }> = [];
  readonly traversals: Array<{ readonly info: unknown; readonly key: string }> = [];

  addEventListener(_type: 'navigate', listener: EventListener) {
    this.listener = listener;
  }

  removeEventListener(_type: 'navigate', listener: EventListener) {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  navigate(url: string | URL, options?: NavigationNavigateOptions): NavigationResult {
    if (options?.history !== 'push' && options?.history !== 'replace') {
      throw new TypeError('Expected an explicit push or replace navigation.');
    }
    this.nativeNavigations.push({
      options: { history: options.history, info: options.info },
      url: url.toString(),
    });
    return {
      committed: Promise.resolve(this.currentEntry),
      finished: Promise.resolve(this.currentEntry),
    };
  }

  traverseTo(key: string, options?: NavigationOptions): NavigationResult {
    this.traversals.push({ key, info: options?.info });
    return {
      committed: Promise.resolve(this.currentEntry),
      finished: Promise.resolve(this.currentEntry),
    };
  }

  dispatch(event: TestNavigateEvent) {
    this.listener?.(event);
  }

  entries() {
    return [this.initialEntry, this.currentEntry];
  }

  get isListening() {
    return this.listener !== null;
  }
}

type TestNavigateEventOverrides = Partial<
  Pick<
    NavigateEvent,
    | 'canIntercept'
    | 'downloadRequest'
    | 'formData'
    | 'hashChange'
    | 'info'
    | 'navigationType'
    | 'signal'
  >
> & {
  readonly cancelable?: boolean;
  readonly destination?: { readonly id?: string; readonly key?: string; readonly url: string };
};

const makeNavigationEvent = (overrides: TestNavigateEventOverrides = {}) => {
  let interception: NavigationInterceptOptions | null = null;
  const {
    cancelable = true,
    destination = { url: 'https://effective-rsc.test/schedule/day-two' },
    ...eventOverrides
  } = overrides;
  const navigationType: NavigationType = 'push';
  const event = Object.assign(new Event('navigate', { cancelable }), {
    canIntercept: true,
    destination: {
      getState: () => undefined,
      id: destination.id ?? destination.key ?? '',
      index: -1,
      key: destination.key ?? '',
      sameDocument: false,
      url: destination.url,
    },
    downloadRequest: null,
    formData: null,
    hasUAVisualTransition: false,
    hashChange: false,
    info: undefined,
    intercept: (options: NavigationInterceptOptions) => {
      interception = options;
    },
    navigationType,
    scroll: () => undefined,
    signal: new AbortController().signal,
    sourceElement: null,
    userInitiated: true,
    ...eventOverrides,
  }) satisfies TestNavigateEvent;

  return {
    event,
    interception: () => interception,
  };
};

const makeHttpClient = (requestedUrls: Array<string> = [], contentType = 'text/x-component') =>
  HttpClient.make((request) =>
    Effect.sync(() => {
      requestedUrls.push(request.url);
      return HttpClientResponse.fromWeb(
        request,
        new Response(new Uint8Array(), {
          headers: {
            'content-location': 'https://effective-rsc.test/schedule/day-two',
            'content-type': contentType,
          },
        }),
      );
    }),
  );

const makeInvalidFlightClient = () =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(new Uint8Array(), {
          headers: { 'content-type': 'text/x-component' },
        }),
      ),
    ),
  );

type BrowserRenderRequest = {
  readonly _tag: 'Navigation' | 'ServerFunction';
  readonly routeTree: RouteTreeModel;
};

const initialRouteTree: RouteTreeModel = {
  child: null,
  content: null,
  id: 'day-one',
};

const makeBrowserRenderer = (renders: Array<BrowserRenderRequest> = []) =>
  BrowserRenderer.of({
    commit: () => undefined,
    initialize: () => undefined,
    navigate: (routeTree) => {
      renders.push({ _tag: 'Navigation', routeTree });
      return {
        committed: Promise.resolve(),
        discard: () => Promise.resolve(),
        retired: Promise.withResolvers<void>().promise,
      };
    },
    refresh: (routeTree) => {
      renders.push({ _tag: 'ServerFunction', routeTree });
      return Promise.resolve();
    },
  });

const makePrecommitController = (
  redirects: Array<{
    readonly options: NavigationNavigateOptions | undefined;
    readonly url: string;
  }> = [],
  handlers: Array<NavigationInterceptHandler> = [],
): NavigationPrecommitController => ({
  addHandler: (handler) => handlers.push(handler),
  redirect: (url, options) => redirects.push({ options, url: url.toString() }),
});

const invokeNavigationHandler = (handler: NavigationInterceptHandler) => Promise.resolve(handler());

const invokePrecommitHandler = (
  handler: NavigationPrecommitHandler,
  controller: NavigationPrecommitController,
) => Promise.resolve(handler(controller));

const prepareNavigation = Effect.fnUntraced(function* (navigation: TestNavigationApi, url: string) {
  const pendingNavigation = makeNavigationEvent({ destination: { url } });
  navigation.dispatch(pendingNavigation.event);
  const precommitHandler = pendingNavigation.interception()?.precommitHandler;
  if (precommitHandler === undefined) {
    return yield* Effect.die('Expected a precommit handler.');
  }
  const handlers: Array<NavigationInterceptHandler> = [];
  yield* Effect.promise(() =>
    invokePrecommitHandler(precommitHandler, makePrecommitController([], handlers)),
  );
  const handler = handlers[0];
  if (handler === undefined) {
    return yield* Effect.die('Expected a post-commit handler.');
  }
  return handler;
});

const makeControlledRoute = Effect.fnUntraced(function* (url: string) {
  const completed = yield* Deferred.make<void>();
  const released = Promise.withResolvers<void>();
  const cachedEntries: Array<NavigationHistoryEntry> = [];
  return {
    cachedEntries,
    completed,
    released,
    resource: {
      _tag: 'Route',
      cache: (entry) => cachedEntries.push(entry),
      completed: Deferred.await(completed),
      release: Effect.sync(released.resolve),
      resolvedUrl: new URL(url),
      routeTree: { ...initialRouteTree, id: new URL(url).pathname },
    } satisfies RouteLoad,
  };
});

const makeNavigationApiLayer = (
  navigation: TestNavigationApi,
  documentReplacements: Array<string> = [],
  reloadDocument: () => void = () => undefined,
) =>
  NavigationApi.layerTest({
    getCurrentEntry: () => navigation.currentEntry,
    getCurrentUrl: () => navigation.currentEntry.url,
    getTransition: () => null,
    navigate: (url, options) => navigation.navigate(url, options),
    reloadDocument,
    replaceDocument: (url) => documentReplacements.push(url),
    subscribe: (listener) => {
      navigation.addEventListener('navigate', listener as EventListener);
      return () => navigation.removeEventListener('navigate', listener as EventListener);
    },
    traverseTo: (key, options) => navigation.traverseTo(key, options),
  });

const listen = (
  navigation: TestNavigationApi,
  browserRenderer: BrowserRenderer['Service'] = makeBrowserRenderer(),
  httpClient = makeHttpClient(),
  documentReplacements: Array<string> = [],
  reloadDocument: () => void = () => undefined,
) =>
  Effect.gen(function* () {
    const installed = yield* Deferred.make<void>();
    const navigationApiLayer = makeNavigationApiLayer(
      navigation,
      documentReplacements,
      reloadDocument,
    );
    const flightClientLayer = Layer.effect(
      FlightClient,
      Effect.gen(function* () {
        const flightClient = yield* FlightClient;
        return FlightClient.of({
          ...flightClient,
          loadInitial: Effect.succeed({
            completed: Effect.void,
            payload: {
              formState: null,
              routeTree: initialRouteTree,
              serverFnResult: null,
            },
          }),
        });
      }),
    ).pipe(Layer.provide(FlightClient.layer));
    const routeLoaderLayer = RouteLoader.layer.pipe(
      Layer.provide(flightClientLayer),
      Layer.provide(navigationApiLayer),
    );
    const servicesLayer = Layer.mergeAll(
      BrowserEffectRunner.layer,
      BrowserRenderer.layerTest(browserRenderer),
      navigationApiLayer,
      routeLoaderLayer,
    ).pipe(Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, httpClient)));
    const routerLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        const routeLoader = yield* RouteLoader;
        yield* routeLoader.loadInitial;
        yield* installClientRouter;
        yield* Deferred.succeed(installed, undefined);
      }),
    ).pipe(Layer.provideMerge(servicesLayer));

    const running = yield* Layer.launch(routerLayer).pipe(Effect.forkScoped);
    yield* Effect.raceFirst(Deferred.await(installed), Fiber.join(running));
  });

it.effect('splits a cancelable navigation between React commit and Flight completion', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationApi();
    const requestedUrls: Array<string> = [];
    const renders: Array<BrowserRenderRequest> = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* listen(navigation, makeBrowserRenderer(renders), makeHttpClient(requestedUrls));
        const pendingNavigation = makeNavigationEvent();

        navigation.dispatch(pendingNavigation.event);

        const interception = pendingNavigation.interception();
        expect(interception?.handler).toBeUndefined();
        expect(interception?.precommitHandler).toBeTypeOf('function');
        const precommitHandler = interception?.precommitHandler;
        if (precommitHandler === undefined) {
          return yield* Effect.die('Expected a precommit handler.');
        }

        const handlers: Array<NavigationInterceptHandler> = [];
        yield* Effect.promise(() =>
          invokePrecommitHandler(precommitHandler, makePrecommitController([], handlers)),
        );
        expect(handlers).toHaveLength(1);
        const handler = handlers[0];
        if (handler === undefined) {
          return yield* Effect.die('Expected a post-commit handler.');
        }
        yield* Effect.promise(() => invokeNavigationHandler(handler));

        expect(requestedUrls).toEqual(['https://effective-rsc.test/schedule/day-two']);
        expect(renders).toHaveLength(1);
        const render = renders[0];
        if (render?._tag !== 'Navigation') {
          return yield* Effect.die('Expected a navigation render.');
        }
        expect(render.routeTree.id).toBe('root');
      }),
    );
  }),
);

it.effect('settles the post-commit handler before the Flight stream reaches EOF', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      let responseController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const httpClient = HttpClient.make((request) =>
        Effect.sync(() =>
          HttpClientResponse.fromWeb(
            request,
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  responseController = controller;
                  controller.enqueue(new Uint8Array([1]));
                },
              }),
              {
                headers: {
                  'content-location': 'https://effective-rsc.test/schedule/day-two',
                  'content-type': 'text/x-component',
                },
              },
            ),
          ),
        ),
      );
      yield* listen(navigation, makeBrowserRenderer(), httpClient);
      const pendingNavigation = makeNavigationEvent();

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      const precommitHandler = interception?.precommitHandler;
      if (precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }

      const handlers: Array<NavigationInterceptHandler> = [];
      yield* Effect.promise(() =>
        invokePrecommitHandler(precommitHandler, makePrecommitController([], handlers)),
      );
      const handler = handlers[0];
      if (handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }
      let handlerSettled = false;
      const navigationFinished = invokeNavigationHandler(handler).then(() => {
        handlerSettled = true;
      });
      yield* Effect.promise(() => Promise.resolve());

      expect(handlerSettled).toBe(true);
      if (responseController === undefined) {
        return yield* Effect.die('Expected a streaming Flight response.');
      }
      responseController.close();
      yield* Effect.promise(() => navigationFinished);
      expect(handlerSettled).toBe(true);
    }),
  ),
);

it.effect('uses a post-commit handler for a non-cancelable traversal', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const requestedUrls: Array<string> = [];
      yield* listen(navigation, makeBrowserRenderer(), makeHttpClient(requestedUrls));
      const pendingNavigation = makeNavigationEvent({
        cancelable: false,
        navigationType: 'traverse',
      });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      expect(interception?.precommitHandler).toBeUndefined();
      expect(interception?.handler).toBeTypeOf('function');
      const handler = interception?.handler;
      if (handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }

      yield* Effect.promise(() => invokeNavigationHandler(handler));

      expect(requestedUrls).toEqual(['https://effective-rsc.test/schedule/day-two']);
    }),
  ),
);

it.effect('reloads after a non-cancelable traversal fails to load Flight', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const reloadDocument = vi.fn();
      yield* listen(
        navigation,
        makeBrowserRenderer(),
        makeInvalidFlightClient(),
        [],
        reloadDocument,
      );
      const pendingNavigation = makeNavigationEvent({
        cancelable: false,
        navigationType: 'traverse',
      });

      navigation.dispatch(pendingNavigation.event);

      const handler = pendingNavigation.interception()?.handler;
      if (handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }
      yield* Effect.promise(() => invokeNavigationHandler(handler));

      expect(reloadDocument).toHaveBeenCalledOnce();
    }),
  ),
);

it.effect('does not reload a superseded non-cancelable traversal', () => {
  const navigationAbort = new AbortController();
  navigationAbort.abort();
  return Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const reloadDocument = vi.fn();
      yield* listen(
        navigation,
        makeBrowserRenderer(),
        makeInvalidFlightClient(),
        [],
        reloadDocument,
      );
      const pendingNavigation = makeNavigationEvent({
        cancelable: false,
        navigationType: 'traverse',
        signal: navigationAbort.signal,
      });

      navigation.dispatch(pendingNavigation.event);

      const handler = pendingNavigation.interception()?.handler;
      if (handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }
      yield* Effect.promise(() => invokeNavigationHandler(handler));

      expect(reloadDocument).not.toHaveBeenCalled();
    }),
  );
});

it.effect('coordinates cache identity across Flight and history commit ordering', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const dayTwoUrl = 'https://effective-rsc.test/schedule/day-two';
      const dayThreeUrl = 'https://effective-rsc.test/schedule/day-three';
      const dayFourUrl = 'https://effective-rsc.test/schedule/day-four';
      const dayFiveUrl = 'https://effective-rsc.test/schedule/day-five';
      const dayTwo = yield* makeControlledRoute(dayTwoUrl);
      const dayThree = yield* makeControlledRoute(dayThreeUrl);
      const dayFour = yield* makeControlledRoute(dayFourUrl);
      const dayFive = yield* makeControlledRoute(dayFiveUrl);
      const routes = new Map([
        [dayTwoUrl, dayTwo.resource],
        [dayThreeUrl, dayThree.resource],
        [dayFourUrl, dayFour.resource],
        [dayFiveUrl, dayFive.resource],
      ]);
      const installed = yield* Deferred.make<void>();
      const servicesLayer = Layer.mergeAll(
        BrowserEffectRunner.layer,
        BrowserRenderer.layerTest(makeBrowserRenderer()),
        makeNavigationApiLayer(navigation),
        RouteLoader.layerTest({
          invalidate: () => undefined,
          load: ({ destination }) => {
            const resource = routes.get(destination.url);
            return resource === undefined
              ? Effect.die(new TypeError(`Unexpected route ${destination.url}.`))
              : Effect.succeed(resource);
          },
          loadInitial: Effect.die(new TypeError('Unexpected initial route load.')),
          prepareRefresh: () => () => undefined,
        }),
      ).pipe(Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, makeHttpClient())));
      const routerLayer = Layer.effectDiscard(
        installClientRouter.pipe(Effect.andThen(Deferred.succeed(installed, undefined))),
      ).pipe(Layer.provideMerge(servicesLayer));
      const running = yield* Layer.launch(routerLayer).pipe(Effect.forkScoped);
      yield* Effect.raceFirst(Deferred.await(installed), Fiber.join(running));

      const dayTwoHistory = yield* prepareNavigation(navigation, dayTwoUrl);
      yield* Deferred.succeed(dayTwo.completed, undefined);
      yield* Effect.promise(() => dayTwo.released.promise);
      expect(dayTwo.cachedEntries).toEqual([]);

      const dayTwoEntry = makeNavigationEntry('day-two', dayTwoUrl);
      navigation.currentEntry = dayTwoEntry;
      yield* Effect.promise(() => invokeNavigationHandler(dayTwoHistory));
      expect(dayTwo.cachedEntries).toEqual([dayTwoEntry]);

      const dayThreeHistory = yield* prepareNavigation(navigation, dayThreeUrl);
      const dayThreeEntry = makeNavigationEntry('day-three', dayThreeUrl);
      navigation.currentEntry = dayThreeEntry;
      yield* Effect.promise(() => invokeNavigationHandler(dayThreeHistory));
      expect(dayThree.cachedEntries).toEqual([]);

      navigation.currentEntry = makeNavigationEntry('unrelated', dayFiveUrl);
      yield* Deferred.succeed(dayThree.completed, undefined);
      yield* Effect.promise(() => dayThree.released.promise);
      expect(dayThree.cachedEntries).toEqual([dayThreeEntry]);

      const dayFourHistory = yield* prepareNavigation(navigation, dayFourUrl);
      const dayFourEntry = makeNavigationEntry('day-four', dayFourUrl);
      navigation.currentEntry = dayFourEntry;
      yield* Effect.promise(() => invokeNavigationHandler(dayFourHistory));

      yield* prepareNavigation(navigation, dayFiveUrl);
      yield* Effect.promise(() => dayFour.released.promise);
      yield* Deferred.succeed(dayFour.completed, undefined);
      yield* Effect.yieldNow;
      expect(dayFour.cachedEntries).toEqual([]);
    }),
  ),
);

it.effect('reuses completed route trees for back and forward traversals', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const dayOneEntry = navigation.currentEntry;
      const dayTwoEntry = makeNavigationEntry(
        'day-two',
        'https://effective-rsc.test/schedule/day-two',
      );
      const requestedUrls: Array<string> = [];
      const renders: Array<BrowserRenderRequest> = [];
      yield* listen(navigation, makeBrowserRenderer(renders), makeHttpClient(requestedUrls));
      yield* Effect.yieldNow;

      const push = makeNavigationEvent();
      navigation.dispatch(push.event);
      const pushPrecommit = push.interception()?.precommitHandler;
      if (pushPrecommit === undefined) {
        return yield* Effect.die('Expected a push precommit handler.');
      }
      const pushHandlers: Array<NavigationInterceptHandler> = [];
      yield* Effect.promise(() =>
        invokePrecommitHandler(pushPrecommit, makePrecommitController([], pushHandlers)),
      );
      navigation.currentEntry = dayTwoEntry;
      const pushHandler = pushHandlers[0];
      if (pushHandler === undefined) {
        return yield* Effect.die('Expected a push post-commit handler.');
      }
      yield* Effect.promise(() => invokeNavigationHandler(pushHandler));

      const back = makeNavigationEvent({
        destination: { key: dayOneEntry.key, url: dayOneEntry.url },
        navigationType: 'traverse',
      });
      navigation.dispatch(back.event);
      const backPrecommit = back.interception()?.precommitHandler;
      if (backPrecommit === undefined) {
        return yield* Effect.die('Expected a back precommit handler.');
      }
      const backHandlers: Array<NavigationInterceptHandler> = [];
      yield* Effect.promise(() =>
        invokePrecommitHandler(backPrecommit, makePrecommitController([], backHandlers)),
      );
      navigation.currentEntry = dayOneEntry;
      const backHandler = backHandlers[0];
      if (backHandler === undefined) {
        return yield* Effect.die('Expected a back post-commit handler.');
      }
      yield* Effect.promise(() => invokeNavigationHandler(backHandler));

      const forward = makeNavigationEvent({
        destination: { key: dayTwoEntry.key, url: dayTwoEntry.url },
        navigationType: 'traverse',
      });
      navigation.dispatch(forward.event);
      const forwardPrecommit = forward.interception()?.precommitHandler;
      if (forwardPrecommit === undefined) {
        return yield* Effect.die('Expected a forward precommit handler.');
      }
      const forwardHandlers: Array<NavigationInterceptHandler> = [];
      yield* Effect.promise(() =>
        invokePrecommitHandler(forwardPrecommit, makePrecommitController([], forwardHandlers)),
      );
      navigation.currentEntry = dayTwoEntry;
      const forwardHandler = forwardHandlers[0];
      if (forwardHandler === undefined) {
        return yield* Effect.die('Expected a forward post-commit handler.');
      }
      yield* Effect.promise(() => invokeNavigationHandler(forwardHandler));

      expect(requestedUrls).toEqual(['https://effective-rsc.test/schedule/day-two']);
      expect(renders.map((render) => render.routeTree.id)).toEqual(['root', 'day-one', 'root']);
    }),
  ),
);

it.effect('promotes a non-Flight response to native document navigation', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      yield* listen(navigation, makeBrowserRenderer(), makeHttpClient([], 'text/html'));
      const pendingNavigation = makeNavigationEvent();

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      const precommitHandler = interception?.precommitHandler;
      if (precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      yield* Effect.promise(() =>
        invokePrecommitHandler(precommitHandler, makePrecommitController()),
      );

      expect(navigation.nativeNavigations).toEqual([
        {
          options: { history: 'push', info: 'ersc-native-document' },
          url: 'https://effective-rsc.test/schedule/day-two',
        },
      ]);
    }),
  ),
);

it.effect('redirects a cancelable navigation before committing its Flight tree', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const redirects: Array<{
        readonly options: NavigationNavigateOptions | undefined;
        readonly url: string;
      }> = [];
      const handlers: Array<NavigationInterceptHandler> = [];
      const renders: Array<BrowserRenderRequest> = [];
      yield* listen(navigation, makeBrowserRenderer(renders));
      const pendingNavigation = makeNavigationEvent({
        destination: { url: 'https://effective-rsc.test/schedule/day-one' },
      });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      const precommitHandler = interception?.precommitHandler;
      if (precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      yield* Effect.promise(() =>
        invokePrecommitHandler(precommitHandler, makePrecommitController(redirects, handlers)),
      );

      expect(redirects).toEqual([
        {
          options: { history: 'auto' },
          url: 'https://effective-rsc.test/schedule/day-two',
        },
      ]);
      expect(renders).toHaveLength(1);
      expect(handlers).toHaveLength(1);
    }),
  ),
);

it.effect('falls back to document replacement for a redirected traversal', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const documentReplacements: Array<string> = [];
      yield* listen(navigation, makeBrowserRenderer(), makeHttpClient(), documentReplacements);
      const pendingNavigation = makeNavigationEvent({
        cancelable: false,
        destination: { url: 'https://effective-rsc.test/schedule/day-one' },
        navigationType: 'traverse',
      });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      const handler = interception?.handler;
      if (handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }
      yield* Effect.promise(() => invokeNavigationHandler(handler));

      expect(documentReplacements).toEqual(['https://effective-rsc.test/schedule/day-two']);
    }),
  ),
);

it.effect('cancels a streaming Flight response abandoned before React commits', () => {
  const navigationAbort = new AbortController();
  return Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const renderStarted = Promise.withResolvers<void>();
      const renderCommitted = Promise.withResolvers<void>();
      const discardCommitted = Promise.withResolvers<void>();
      const discardStarted = Promise.withResolvers<void>();
      let responseSignal: AbortSignal | undefined;
      const browserRenderer = BrowserRenderer.of({
        commit: () => undefined,
        initialize: () => undefined,
        navigate: () => {
          renderStarted.resolve();
          return {
            committed: renderCommitted.promise,
            discard: () => {
              discardStarted.resolve();
              return discardCommitted.promise;
            },
            retired: Promise.resolve(),
          };
        },
        refresh: () => Promise.resolve(),
      });
      const httpClient = HttpClient.make((request, _url, signal) =>
        Effect.sync(() => {
          responseSignal = signal;
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new Uint8Array([1]));
                  signal.addEventListener('abort', () => controller.error(signal.reason), {
                    once: true,
                  });
                },
              }),
              {
                headers: {
                  'content-location': 'https://effective-rsc.test/schedule/day-two',
                  'content-type': 'text/x-component',
                },
              },
            ),
          );
        }),
      );
      yield* listen(navigation, browserRenderer, httpClient);
      const pendingNavigation = makeNavigationEvent({ signal: navigationAbort.signal });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      if (interception?.precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      const navigationFinished = invokePrecommitHandler(
        interception.precommitHandler,
        makePrecommitController(),
      );
      yield* Effect.promise(() => renderStarted.promise);

      expect(responseSignal?.aborted).toBe(false);

      navigationAbort.abort();
      yield* Effect.promise(() => discardStarted.promise);

      expect(responseSignal?.aborted).toBe(false);

      discardCommitted.resolve();
      const exit = yield* Effect.promise(() => navigationFinished).pipe(Effect.exit);

      expect(Exit.isSuccess(exit)).toBe(true);
      expect(responseSignal?.aborted).toBe(true);
      expect(navigation.traversals).toEqual([]);
    }),
  );
});

it.effect('interrupts a pending Flight load when a newer navigation starts', () => {
  const navigationAbort = new AbortController();
  return Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const requestStarted = Promise.withResolvers<void>();
      const responseAborted = Promise.withResolvers<void>();
      const renders: Array<BrowserRenderRequest> = [];
      const httpClient = HttpClient.make((request, _url, signal) =>
        Effect.sync(() =>
          HttpClientResponse.fromWeb(
            request,
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  requestStarted.resolve();
                  signal.addEventListener(
                    'abort',
                    () => {
                      controller.error(signal.reason);
                      responseAborted.resolve();
                    },
                    { once: true },
                  );
                },
              }),
              {
                headers: {
                  'content-location': 'https://effective-rsc.test/schedule/day-two',
                  'content-type': 'text/x-component',
                },
              },
            ),
          ),
        ),
      );
      yield* listen(navigation, makeBrowserRenderer(renders), httpClient);
      const firstNavigation = makeNavigationEvent({ signal: navigationAbort.signal });

      navigation.dispatch(firstNavigation.event);

      const precommitHandler = firstNavigation.interception()?.precommitHandler;
      if (precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      const firstNavigationFinished = invokePrecommitHandler(
        precommitHandler,
        makePrecommitController(),
      );
      yield* Effect.promise(() => requestStarted.promise);

      navigation.dispatch(
        makeNavigationEvent({
          destination: { url: 'https://effective-rsc.test/schedule/day-three' },
        }).event,
      );
      yield* Effect.promise(() => responseAborted.promise);
      yield* Effect.promise(() => firstNavigationFinished);

      expect(navigationAbort.signal.aborted).toBe(false);
      expect(renders).toEqual([]);
    }),
  );
});

it.effect('discards and releases a scheduled candidate when a newer navigation starts', () => {
  const navigationAbort = new AbortController();
  return Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const renderStarted = Promise.withResolvers<void>();
      const renderCommitted = Promise.withResolvers<void>();
      const discardCommitted = Promise.withResolvers<void>();
      const discardStarted = Promise.withResolvers<void>();
      const responseAborted = Promise.withResolvers<void>();
      let responseSignal: AbortSignal | undefined;
      const browserRenderer = BrowserRenderer.of({
        commit: () => undefined,
        initialize: () => undefined,
        navigate: () => {
          renderStarted.resolve();
          return {
            committed: renderCommitted.promise,
            discard: () => {
              discardStarted.resolve();
              return discardCommitted.promise;
            },
            retired: Promise.resolve(),
          };
        },
        refresh: () => Promise.resolve(),
      });
      const httpClient = HttpClient.make((request, _url, signal) =>
        Effect.sync(() => {
          responseSignal = signal;
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new Uint8Array([1]));
                  signal.addEventListener(
                    'abort',
                    () => {
                      controller.error(signal.reason);
                      responseAborted.resolve();
                    },
                    { once: true },
                  );
                },
              }),
              {
                headers: {
                  'content-location': 'https://effective-rsc.test/schedule/day-two',
                  'content-type': 'text/x-component',
                },
              },
            ),
          );
        }),
      );
      yield* listen(navigation, browserRenderer, httpClient);
      const firstNavigation = makeNavigationEvent({ signal: navigationAbort.signal });

      navigation.dispatch(firstNavigation.event);

      const precommitHandler = firstNavigation.interception()?.precommitHandler;
      if (precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      const firstNavigationFinished = invokePrecommitHandler(
        precommitHandler,
        makePrecommitController(),
      );
      yield* Effect.promise(() => renderStarted.promise);

      navigation.dispatch(
        makeNavigationEvent({
          destination: { url: 'https://effective-rsc.test/schedule/day-three' },
        }).event,
      );
      yield* Effect.promise(() => discardStarted.promise);

      expect(responseSignal?.aborted).toBe(false);

      discardCommitted.resolve();
      yield* Effect.promise(() => responseAborted.promise);

      expect(responseSignal?.aborted).toBe(true);
      expect(navigationAbort.signal.aborted).toBe(false);

      yield* Effect.promise(() => firstNavigationFinished);
    }),
  );
});

it.effect('retains a committed Flight response until its render retires', () => {
  const navigationAbort = new AbortController();
  return Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const renderRetired = Promise.withResolvers<void>();
      const responseAborted = Promise.withResolvers<void>();
      let responseSignal: AbortSignal | undefined;
      const httpClient = HttpClient.make((request, _url, signal) =>
        Effect.sync(() => {
          if (new URL(request.url).pathname === '/schedule/day-three') {
            return HttpClientResponse.fromWeb(
              request,
              new Response(
                new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.error(new Error('Failed to load the successor.'));
                  },
                }),
                {
                  headers: {
                    'content-type': 'text/x-component',
                  },
                },
              ),
            );
          }
          responseSignal = signal;
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new Uint8Array([1]));
                  signal.addEventListener(
                    'abort',
                    () => {
                      controller.error(signal.reason);
                      responseAborted.resolve();
                    },
                    { once: true },
                  );
                },
              }),
              {
                headers: {
                  'content-location': 'https://effective-rsc.test/schedule/day-two',
                  'content-type': 'text/x-component',
                },
              },
            ),
          );
        }),
      );
      const browserRenderer = BrowserRenderer.of({
        commit: () => undefined,
        initialize: () => undefined,
        navigate: () => ({
          committed: Promise.resolve(),
          discard: () => Promise.resolve(),
          retired: renderRetired.promise,
        }),
        refresh: () => Promise.resolve(),
      });
      yield* listen(navigation, browserRenderer, httpClient);
      const pendingNavigation = makeNavigationEvent({ signal: navigationAbort.signal });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      const precommitHandler = interception?.precommitHandler;
      if (precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      const handlers: Array<NavigationInterceptHandler> = [];
      yield* Effect.promise(() =>
        invokePrecommitHandler(precommitHandler, makePrecommitController([], handlers)),
      );
      navigation.currentEntry = makeNavigationEntry(
        'day-two',
        'https://effective-rsc.test/schedule/day-two',
      );
      const handler = handlers[0];
      if (handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }
      yield* Effect.promise(() => invokeNavigationHandler(handler));

      expect(responseSignal?.aborted).toBe(false);

      navigationAbort.abort();
      yield* Effect.yieldNow;

      expect(responseSignal?.aborted).toBe(false);

      const failedNavigation = makeNavigationEvent({
        destination: { url: 'https://effective-rsc.test/schedule/day-three' },
      });
      navigation.dispatch(failedNavigation.event);
      const failedPrecommitHandler = failedNavigation.interception()?.precommitHandler;
      if (failedPrecommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler for the failed successor.');
      }
      const failed = yield* Effect.exit(
        Effect.promise(() =>
          invokePrecommitHandler(failedPrecommitHandler, makePrecommitController()),
        ),
      );

      expect(Exit.isFailure(failed)).toBe(true);
      expect(responseSignal?.aborted).toBe(false);

      renderRetired.resolve();
      yield* Effect.promise(() => responseAborted.promise);

      expect(responseSignal?.aborted).toBe(true);
      expect(navigation.traversals).toEqual([]);
    }),
  );
});

it.effect('leaves navigations outside the router boundary to the browser', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const requestedUrls: Array<string> = [];
      yield* listen(navigation, makeBrowserRenderer(), makeHttpClient(requestedUrls));
      const nativeNavigations = [
        makeNavigationEvent({ canIntercept: false }),
        makeNavigationEvent({ hashChange: true }),
        makeNavigationEvent({ downloadRequest: '' }),
        makeNavigationEvent({ formData: new FormData() }),
        makeNavigationEvent({ info: 'react-transition' }),
        makeNavigationEvent({ info: 'ersc-native-document' }),
        makeNavigationEvent({ navigationType: 'reload' }),
      ];

      for (const navigationEvent of nativeNavigations) {
        navigation.dispatch(navigationEvent.event);
        expect(navigationEvent.interception()).toBeNull();
      }
      expect(requestedUrls).toEqual([]);
    }),
  ),
);

it.effect('removes the listener when its Effect scope closes', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationApi();
    const scope = yield* Scope.make();
    yield* listen(navigation).pipe(Scope.provide(scope));

    expect(navigation.isListening).toBe(true);

    yield* Scope.close(scope, Exit.void);

    expect(navigation.isListening).toBe(false);
  }),
);
