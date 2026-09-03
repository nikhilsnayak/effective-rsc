import { afterEach, expect, it } from '@effect/vitest';
import { Effect, Exit, Scope } from 'effect';
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
import { RouteLoader } from '../../src/client/route-loader';
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
    url,
  });

class TestNavigationApi {
  private listener: ((event: TestNavigateEvent) => void) | null = null;
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

  addEventListener(_type: 'navigate', listener: (event: TestNavigateEvent) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: 'navigate', listener: (event: TestNavigateEvent) => void) {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  navigate(url: string, options: { readonly history: 'push' | 'replace'; readonly info: unknown }) {
    this.nativeNavigations.push({ options, url });
    return { finished: Promise.resolve() };
  }

  traverseTo(key: string, options: { readonly info: unknown }) {
    this.traversals.push({ key, ...options });
    return { finished: Promise.resolve() };
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

const listen = (
  navigation: TestNavigationApi,
  browserRenderer: BrowserRenderer['Service'] = makeBrowserRenderer(),
  httpClient = makeHttpClient(),
  documentReplacements: Array<string> = [],
  reloadDocument: () => void = () => undefined,
) => {
  vi.stubGlobal('window', {
    NavigationPrecommitController: class {},
    location: {
      href: 'https://effective-rsc.test/schedule/day-one',
      reload: reloadDocument,
      replace: (url: string) => documentReplacements.push(url),
    },
    navigation,
  });
  return Effect.gen(function* () {
    const run = yield* BrowserEffectRunner.make;
    const navigationApi = yield* NavigationApi.make;
    const flightClient = yield* FlightClient.make;
    const routeLoader = yield* RouteLoader.make.pipe(
      Effect.provideService(
        FlightClient,
        FlightClient.of({
          ...flightClient,
          loadInitial: Effect.succeed({
            completed: Effect.void,
            payload: {
              formState: null,
              routeTree: initialRouteTree,
              serverFnResult: null,
            },
          }),
        }),
      ),
      Effect.provideService(NavigationApi, navigationApi),
    );
    yield* routeLoader.loadInitial;
    return yield* installClientRouter.pipe(
      Effect.provideService(BrowserEffectRunner, run),
      Effect.provideService(BrowserRenderer, browserRenderer),
      Effect.provideService(NavigationApi, navigationApi),
      Effect.provideService(RouteLoader, routeLoader),
    );
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient));
};

afterEach(() => {
  vi.unstubAllGlobals();
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

      navigationAbort.abort();
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
