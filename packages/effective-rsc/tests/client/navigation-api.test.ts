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

import type { BrowserRenderRequest, BrowserRootController } from '../../src/client/browser-root';
import {
  listenForNavigation,
  NavigationApiUnavailableError,
  NavigationPrecommitUnavailableError,
  type NavigationApi,
  type NavigationApiEvent,
  type NavigationInterceptOptions,
} from '../../src/client/navigation-api';

class TestNavigationApi implements NavigationApi {
  private listener: ((event: NavigationApiEvent) => void) | null = null;

  addEventListener(_type: 'navigate', listener: (event: NavigationApiEvent) => void) {
    this.listener = listener;
  }

  removeEventListener(_type: 'navigate', listener: (event: NavigationApiEvent) => void) {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  dispatch(event: NavigationApiEvent) {
    this.listener?.(event);
  }

  get isListening() {
    return this.listener !== null;
  }
}

const makeNavigationEvent = (overrides: Partial<NavigationApiEvent> = {}) => {
  let interception: NavigationInterceptOptions | null = null;
  const event: NavigationApiEvent = {
    cancelable: true,
    canIntercept: true,
    destination: { url: 'https://effective-rsc.test/schedule/day-two' },
    downloadRequest: null,
    formData: null,
    hashChange: false,
    info: undefined,
    intercept: (options) => {
      interception = options;
    },
    navigationType: 'push',
    signal: new AbortController().signal,
    ...overrides,
  };

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
          headers: { 'content-type': contentType },
        }),
      );
    }),
  );

const makeBrowserRoot = (renders: Array<BrowserRenderRequest> = []) =>
  ({
    render: (request) => {
      renders.push(request);
      return Promise.resolve();
    },
  }) satisfies BrowserRootController;

const listen = (
  navigation: NavigationApi,
  browserRoot: BrowserRootController = makeBrowserRoot(),
  httpClient = makeHttpClient(),
) => {
  vi.stubGlobal('window', { NavigationPrecommitController: class {}, navigation });
  return listenForNavigation(browserRoot).pipe(
    Effect.provideService(HttpClient.HttpClient, httpClient),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it.effect('holds a cancelable navigation in precommit until rendering completes', () =>
  Effect.gen(function* () {
    const navigation = new TestNavigationApi();
    const requestedUrls: Array<string> = [];
    const renders: Array<BrowserRenderRequest> = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* listen(navigation, makeBrowserRoot(renders), makeHttpClient(requestedUrls));
        const pendingNavigation = makeNavigationEvent();

        navigation.dispatch(pendingNavigation.event);

        const interception = pendingNavigation.interception();
        expect(interception?.handler).toBeUndefined();
        expect(interception?.precommitHandler).toBeTypeOf('function');
        if (interception?.precommitHandler === undefined) {
          return yield* Effect.die('Expected a precommit handler.');
        }

        yield* Effect.promise(interception.precommitHandler);

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

it.effect('uses a post-commit handler for a non-cancelable traversal', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const requestedUrls: Array<string> = [];
      yield* listen(navigation, makeBrowserRoot(), makeHttpClient(requestedUrls));
      const pendingNavigation = makeNavigationEvent({
        cancelable: false,
        navigationType: 'traverse',
      });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      expect(interception?.precommitHandler).toBeUndefined();
      expect(interception?.handler).toBeTypeOf('function');
      if (interception?.handler === undefined) {
        return yield* Effect.die('Expected a post-commit handler.');
      }

      yield* Effect.promise(interception.handler);

      expect(requestedUrls).toEqual(['https://effective-rsc.test/schedule/day-two']);
    }),
  ),
);

it.effect('rejects the intercepted navigation when Flight loading fails', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      yield* listen(navigation, makeBrowserRoot(), makeHttpClient([], 'text/html'));
      const pendingNavigation = makeNavigationEvent();

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      if (interception?.precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      const exit = yield* Effect.promise(interception.precommitHandler).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
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
      let responseSignal: AbortSignal | undefined;
      const browserRoot = {
        render: () => {
          renderStarted.resolve();
          return renderCommitted.promise;
        },
      } satisfies BrowserRootController;
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
              { headers: { 'content-type': 'text/x-component' } },
            ),
          );
        }),
      );
      yield* listen(navigation, browserRoot, httpClient);
      const pendingNavigation = makeNavigationEvent({ signal: navigationAbort.signal });

      navigation.dispatch(pendingNavigation.event);

      const interception = pendingNavigation.interception();
      if (interception?.precommitHandler === undefined) {
        return yield* Effect.die('Expected a precommit handler.');
      }
      const navigationFinished = interception.precommitHandler();
      yield* Effect.promise(() => renderStarted.promise);

      expect(responseSignal?.aborted).toBe(false);

      navigationAbort.abort();
      const exit = yield* Effect.promise(() => navigationFinished).pipe(Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      expect(responseSignal?.aborted).toBe(true);
    }),
  );
});

it.effect('leaves navigations outside the router boundary to the browser', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = new TestNavigationApi();
      const requestedUrls: Array<string> = [];
      yield* listen(navigation, makeBrowserRoot(), makeHttpClient(requestedUrls));
      const nativeNavigations = [
        makeNavigationEvent({ canIntercept: false }),
        makeNavigationEvent({ hashChange: true }),
        makeNavigationEvent({ downloadRequest: '' }),
        makeNavigationEvent({ formData: new FormData() }),
        makeNavigationEvent({ info: 'react-transition' }),
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

it.effect('fails explicitly when the browser does not provide the Navigation API', () =>
  Effect.sync(() => vi.stubGlobal('window', {})).pipe(
    Effect.andThen(listenForNavigation(makeBrowserRoot())),
    Effect.provideService(HttpClient.HttpClient, makeHttpClient()),
    Effect.flip,
    Effect.map((error) => {
      expect(error).toBeInstanceOf(NavigationApiUnavailableError);
    }),
  ),
);

it.effect('fails explicitly when the browser does not provide navigation precommit', () =>
  Effect.sync(() => vi.stubGlobal('window', { navigation: new TestNavigationApi() })).pipe(
    Effect.andThen(listenForNavigation(makeBrowserRoot())),
    Effect.provideService(HttpClient.HttpClient, makeHttpClient()),
    Effect.flip,
    Effect.map((error) => {
      expect(error).toBeInstanceOf(NavigationPrecommitUnavailableError);
    }),
  ),
);
