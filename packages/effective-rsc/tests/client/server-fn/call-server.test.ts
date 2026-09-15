import { beforeEach, expect, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Layer, MutableRef, type Scope, Stream } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import { encodeReply } from 'react-server-dom-rspack/client.browser';
import { vi } from 'vitest';

import { BrowserEffectRunner } from '../../../src/client/browser-effect-runner';
import { type BrowserRender, BrowserRenderer } from '../../../src/client/browser-renderer';
import {
  FlightClient,
  FlightLoadError,
  type FlightRequest,
} from '../../../src/client/flight-client';
import { NavigationApi } from '../../../src/client/navigation-api';
import { RouteLoader } from '../../../src/client/route-loader';
import { RouteRefresher } from '../../../src/client/route-refresh';
import { query, stream } from '../../../src/client/server-fn/query';
import type { RouteResponseModel } from '../../../src/rsc/flight';
import type { RouteTreeModel } from '../../../src/rsc/route-tree';
import { ServerFnTransportError } from '../../../src/rsc/server-fn-error';

type ServerCallback = (id: string, args: ReadonlyArray<unknown>) => Promise<unknown>;

const reactClient = vi.hoisted(() => ({
  serverCallback: undefined as ServerCallback | undefined,
  transitionTypes: [] as Array<string>,
}));

vi.mock('react', (importOriginal) =>
  importOriginal<typeof import('react')>().then((original) => ({
    ...original,
    addTransitionType: (type: string) => {
      reactClient.transitionTypes.push(type);
    },
  })),
);

vi.mock('react-server-dom-rspack/client.browser', () => ({
  createTemporaryReferenceSet: vi.fn(() => ({})),
  encodeReply: vi.fn(() => Promise.resolve('encoded arguments')),
  setServerCallback: vi.fn((callback: ServerCallback) => {
    reactClient.serverCallback = callback;
  }),
}));

const { installCallServer } = await import('../../../src/client/server-fn/call-server');

const makeRouteTree = (id: string): RouteTreeModel => ({ child: null, content: null, id });

const stubLoad = (
  load: (request: FlightRequest) => Effect.Effect<unknown, FlightLoadError, Scope.Scope>,
) => load as FlightClient['Service']['load'];

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
  model: {
    formState: null,
    routeTree: makeRouteTree(id),
    serverFnResponse: { _tag: 'Success' as const, value },
  } satisfies RouteResponseModel,
  release,
  resolvedUrl: new URL(firstEntry.url),
});

const invokeServerFn = (id: string, args: ReadonlyArray<unknown> = []) => {
  if (reactClient.serverCallback === undefined) {
    throw new TypeError('Expected the React Server Function callback to be installed.');
  }
  return reactClient.serverCallback(id, args);
};

beforeEach(() => {
  reactClient.serverCallback = undefined;
  reactClient.transitionTypes.length = 0;
});

type CallServerDependencies =
  | BrowserEffectRunner
  | BrowserRenderer
  | FlightClient
  | NavigationApi
  | RouteLoader
  | RouteRefresher;

const listen = Effect.fnUntraced(function* (
  dependencies: Layer.Layer<CallServerDependencies, never, HttpClient.HttpClient>,
) {
  const installed = yield* Deferred.make<void>();
  const callServerLayer = Layer.effectDiscard(
    installCallServer.pipe(Effect.andThen(Deferred.succeed(installed, undefined))),
  ).pipe(Layer.provideMerge(dependencies));
  const running = yield* Layer.launch(callServerLayer).pipe(Effect.forkScoped);
  yield* Effect.raceFirst(Deferred.await(installed), Fiber.join(running));
});

for (const outcome of [
  'Success',
  'TransportFailure',
  'Interrupt',
  'SourceFailure',
  'EarlyStop',
] as const) {
  it.effect(`owns a streaming query through full response completion: ${outcome}`, () =>
    Effect.gen(function* () {
      const completed = yield* Deferred.make<void, FlightLoadError>();
      const released = yield* Deferred.make<void>();
      const received = yield* Deferred.make<void>();
      const release = vi.fn(() => Deferred.succeed(released, undefined));
      let controller!: ReadableStreamDefaultController<string>;
      const value = new ReadableStream<string>({
        start(streamController) {
          controller = streamController;
          controller.enqueue('card');
          if (outcome !== 'SourceFailure') {
            controller.close();
          }
        },
      });
      yield* listen(
        Layer.mergeAll(
          BrowserEffectRunner.layer,
          BrowserRenderer.layerTest({
            commit: () => undefined,
            initialize: () => undefined,
            navigate: () => {
              throw new TypeError('Unexpected navigation render.');
            },
            refresh: () => {
              throw new TypeError('Unexpected route refresh.');
            },
          }),
          NavigationApi.layerTest({
            getCurrentUrl: () => firstEntry.url,
            getCurrentEntry: () => firstEntry,
            getTransition: () => null,
            navigate: () => {
              throw new TypeError('Unexpected navigation.');
            },
            reloadDocument: () => undefined,
            replaceDocument: () => undefined,
            subscribe: () => () => undefined,
          }),
          FlightClient.layerTest({
            load: stubLoad((request) => {
              expect(request._tag).toBe('Query');
              return Effect.succeed({
                _tag: 'Flight',
                model: { _tag: 'Success', value },
                completed: Deferred.await(completed),
                release: Effect.suspend(release),
                resolvedUrl: new URL(firstEntry.url),
              });
            }),
          }),
          RouteLoader.layerTest({
            invalidate: () => undefined,
            prepareRefresh: () => () => undefined,
          }),
          RouteRefresher.layerTest({}),
        ),
      );
      const read = stream(
        (...args: ReadonlyArray<unknown>) =>
          invokeServerFn('stream', args) as Promise<ReadableStream<string>>,
      );
      const values: string[] = [];
      const source = read('input').pipe(
        Stream.tap((value) =>
          Effect.sync(() => {
            values.push(value);
            Deferred.doneUnsafe(received, Effect.void);
          }),
        ),
      );
      const consumer = yield* Stream.runDrain(
        outcome === 'EarlyStop' ? source.pipe(Stream.take(1)) : source,
      ).pipe(Effect.forkScoped);
      yield* Deferred.await(received);
      yield* Effect.yieldNow;
      expect(values).toEqual(['card']);
      expect(encodeReply).toHaveBeenLastCalledWith(
        ['input'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      if (outcome !== 'EarlyStop') {
        expect(consumer.pollUnsafe()).toBeUndefined();
        expect(release).not.toHaveBeenCalled();
      }

      switch (outcome) {
        case 'Success':
          yield* Deferred.succeed(completed, undefined);
          yield* Fiber.join(consumer);
          break;
        case 'TransportFailure': {
          yield* Deferred.fail(
            completed,
            new FlightLoadError({
              cause: new Error('connection lost after last item'),
              reason: 'RequestFailed',
            }),
          );
          const failure = yield* Effect.flip(Fiber.join(consumer));
          expect(failure._tag).toBe('ServerFnTransportError');
          break;
        }
        case 'Interrupt':
          yield* Fiber.interrupt(consumer);
          break;
        case 'SourceFailure': {
          controller.error(Object.assign(new Error('producer failed'), { digest: 'stream-error' }));
          const failure = yield* Effect.flip(Fiber.join(consumer));
          expect(failure).toMatchObject({ _tag: 'ServerFnDefect', digest: 'stream-error' });
          break;
        }
        case 'EarlyStop':
          yield* Fiber.join(consumer);
          break;
      }
      yield* Deferred.await(released);
      expect(release).toHaveBeenCalledOnce();
      expect(values).toEqual(['card']);
    }).pipe(
      Effect.scoped,
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
      ),
    ),
  );
}

it.effect('preserves mutation arguments containing malformed query metadata', () =>
  Effect.gen(function* () {
    const load = vi.fn((_request: FlightRequest) =>
      Effect.fail(new FlightLoadError({ cause: 'offline', reason: 'RequestFailed' })),
    );
    yield* listen(
      Layer.mergeAll(
        BrowserEffectRunner.layer,
        BrowserRenderer.layerTest({
          commit: () => undefined,
          initialize: () => undefined,
          navigate: () => {
            throw new TypeError('Unexpected navigation render.');
          },
          refresh: () => {
            throw new TypeError('Unexpected route refresh.');
          },
        }),
        FlightClient.layerTest({ load: stubLoad(load) }),
        NavigationApi.layerTest({
          getCurrentEntry: () => firstEntry,
          getCurrentUrl: () => firstEntry.url,
          getTransition: () => null,
          navigate: () => {
            throw new TypeError('Unexpected navigation.');
          },
          reloadDocument: () => undefined,
          replaceDocument: () => undefined,
          subscribe: () => () => undefined,
        }),
        RouteLoader.layerTest({
          invalidate: () => undefined,
          prepareRefresh: () => () => undefined,
        }),
        RouteRefresher.layerTest({}),
      ),
    );

    for (const metadata of [
      null,
      undefined,
      {},
      { signal: 'invalid' },
      {
        _tag: 'Query',
        get signal() {
          throw new Error('Metadata inspection failed.');
        },
      },
    ]) {
      const args = ['first', { id: 'ticket-1', [Symbol.for('ersc/ServerFnQuery')]: metadata }];
      const error = yield* Effect.promise(() =>
        invokeServerFn('mutation', args).then(
          () => expect.unreachable('Expected the offline transport to reject.'),
          (cause: unknown) => cause,
        ),
      );

      expect(error).toBeInstanceOf(ServerFnTransportError);
      expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ _tag: 'Mutation' }));
      expect(encodeReply).toHaveBeenLastCalledWith(args, expect.anything());
    }
  }).pipe(
    Effect.scoped,
    Effect.provideService(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
    ),
  ),
);

for (const mode of ['Mutation', 'Query'] as const) {
  for (const failure of ['Encoding', 'RequestFailed', 'DecodeFailed'] as const) {
    it.effect(`reports ${failure} as a transport error for ${mode}`, () =>
      Effect.gen(function* () {
        const load = vi.fn((request: FlightRequest) => {
          expect(request._tag).toBe(mode);
          return Effect.fail(
            new FlightLoadError({
              cause: new Error('unavailable'),
              reason: failure === 'Encoding' ? 'RequestFailed' : failure,
            }),
          );
        });
        yield* listen(
          Layer.mergeAll(
            BrowserEffectRunner.layer,
            BrowserRenderer.layerTest({
              commit: () => undefined,
              initialize: () => undefined,
              navigate: () => {
                throw new TypeError('Unexpected navigation render.');
              },
              refresh: () => {
                throw new TypeError('Unexpected route refresh.');
              },
            }),
            FlightClient.layerTest({ load: stubLoad(load) }),
            NavigationApi.layerTest({
              getCurrentEntry: () => firstEntry,
              getCurrentUrl: () => firstEntry.url,
              getTransition: () => null,
              navigate: () => {
                throw new TypeError('Unexpected navigation.');
              },
              reloadDocument: () => undefined,
              replaceDocument: () => undefined,
              subscribe: () => () => undefined,
            }),
            RouteLoader.layerTest({
              invalidate: () => undefined,
              prepareRefresh: () => () => undefined,
            }),
            RouteRefresher.layerTest({}),
          ),
        );
        if (failure === 'Encoding') {
          vi.mocked(encodeReply).mockRejectedValueOnce(new Error('cannot encode argument'));
        }
        const serverFn = (...args: ReadonlyArray<unknown>) => invokeServerFn('failure', args);
        const error = yield* mode === 'Query'
          ? Effect.match(query(serverFn)(), {
              onFailure: (cause) => cause,
              onSuccess: () => expect.unreachable('Expected the query to fail.'),
            })
          : Effect.promise(() =>
              serverFn().then(
                () => expect.unreachable('Expected the invocation to reject.'),
                (cause: unknown) => cause,
              ),
            );

        expect(error).toBeInstanceOf(ServerFnTransportError);
        expect(error).toMatchObject({
          _tag: 'ServerFnTransportError',
          detail: {
            message:
              failure === 'Encoding'
                ? 'Failed to encode arguments.'
                : 'Server Function request failed.',
          },
        });
        expect(load).toHaveBeenCalledTimes(failure === 'Encoding' ? 0 : 1);
      }).pipe(
        Effect.scoped,
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
        ),
      ),
    );
  }
}

it.effect('releases an incomplete Server Function response', () =>
  Effect.scoped(
    Effect.gen(function* () {
      const released = vi.fn();
      const navigationApiLayer = NavigationApi.layerTest({
        getCurrentEntry: () => firstEntry,
        getCurrentUrl: () => firstEntry.url,
        getTransition: () => null,
        navigate: () => {
          throw new TypeError('Unexpected navigation.');
        },
        reloadDocument: () => undefined,
        replaceDocument: () => undefined,
        subscribe: () => () => undefined,
      });
      const flightClientLayer = FlightClient.layerTest({
        load: stubLoad(() =>
          Effect.succeed({
            _tag: 'Flight' as const,
            completed: Effect.void,
            model: {
              formState: null,
              routeTree: makeRouteTree('incomplete'),
              serverFnResponse: null,
            },
            release: Effect.sync(released),
            resolvedUrl: new URL(firstEntry.url),
          }),
        ),
        loadInitial: Effect.die('Unexpected initial Flight load.'),
      });
      yield* listen(
        Layer.mergeAll(
          BrowserEffectRunner.layer,
          BrowserRenderer.layerTest({
            commit: () => undefined,
            initialize: () => undefined,
            navigate: () => {
              throw new TypeError('Unexpected navigation render.');
            },
            refresh: () => {
              throw new TypeError('Unexpected route refresh.');
            },
          }),
          flightClientLayer,
          navigationApiLayer,
          RouteLoader.layerTest({
            invalidate: () => undefined,
            prepareRefresh: () => () => undefined,
          }),
          RouteRefresher.layerTest({}),
        ),
      );

      const exit = yield* Effect.exit(Effect.promise(() => invokeServerFn('incomplete')));

      expect(Exit.isFailure(exit)).toBe(true);
      expect(released).toHaveBeenCalledOnce();
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
      ),
    ),
  ),
);

type TestNavigationState = {
  readonly currentEntry: MutableRef.MutableRef<NavigationHistoryEntry | null>;
  readonly transition: MutableRef.MutableRef<NavigationTransition | null>;
};

const staleResponseScenario = (
  changeNavigation: (state: TestNavigationState) => void,
  changeTiming: 'BeforeResponse' | 'DuringInterruption' = 'BeforeResponse',
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const response = yield* Deferred.make<ReturnType<typeof makeFlight>>();
      const requestStarted = yield* Deferred.make<void>();
      const currentRouteRefresh = yield* Deferred.make<void>();
      const refreshTransitionTypes: Array<string> = [];
      const released = vi.fn();
      const rendered = vi.fn(() => {
        throw new TypeError('Unexpected response render.');
      });
      const navigationState: TestNavigationState = {
        currentEntry: MutableRef.make(firstEntry),
        transition: MutableRef.make(null),
      };
      const navigationApiLayer = NavigationApi.layerTest({
        getCurrentEntry: () => MutableRef.get(navigationState.currentEntry),
        getCurrentUrl: () => MutableRef.get(navigationState.currentEntry)?.url ?? firstEntry.url,
        getTransition: () => MutableRef.get(navigationState.transition),
        navigate: () => {
          throw new TypeError('Unexpected navigation.');
        },
        reloadDocument: () => undefined,
        replaceDocument: () => undefined,
        subscribe: () => () => undefined,
      });
      const flightClientLayer = FlightClient.layerTest({
        load: stubLoad(() =>
          Deferred.succeed(requestStarted, undefined).pipe(
            Effect.andThen(Deferred.await(response)),
          ),
        ),
        loadInitial: Effect.die('Unexpected initial Flight load.'),
      });
      const browserRendererLayer = BrowserRenderer.layerTest({
        commit: () => undefined,
        initialize: () => undefined,
        navigate: () => {
          throw new TypeError('Unexpected navigation render.');
        },
        refresh: rendered,
      });
      const routeLoaderLayer = RouteLoader.layerTest({
        invalidate: () => undefined,
        load: () => Effect.die('Unexpected route load.'),
        loadInitial: Effect.die('Unexpected initial route load.'),
        prepareRefresh: () => () => undefined,
      });
      const routeRefresherLayer = RouteRefresher.layerTest({
        interruptCurrentRouteRefresh: Effect.sync(() => {
          if (changeTiming === 'DuringInterruption') {
            changeNavigation(navigationState);
          }
        }),
        refreshCurrentRoute: (transitionType) =>
          Effect.sync(() => refreshTransitionTypes.push(transitionType)).pipe(
            Effect.andThen(Deferred.succeed(currentRouteRefresh, undefined)),
          ),
        replace: () => Effect.void,
      });
      yield* listen(
        Layer.mergeAll(
          BrowserEffectRunner.layer,
          browserRendererLayer,
          flightClientLayer,
          navigationApiLayer,
          routeLoaderLayer,
          routeRefresherLayer,
        ),
      );

      const result = invokeServerFn('first');
      yield* Deferred.await(requestStarted);
      if (changeTiming === 'BeforeResponse') {
        changeNavigation(navigationState);
      }
      yield* Deferred.succeed(response, makeFlight('stale', 'first result', Effect.sync(released)));

      const value = yield* Effect.promise(() => result);
      expect(value).toBe('first result');
      yield* Deferred.await(currentRouteRefresh);
      expect(refreshTransitionTypes).toEqual(['server-function']);
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

it.effect('rechecks the entry after awaiting older refresh cleanup', () =>
  staleResponseScenario(
    ({ currentEntry }) => MutableRef.set(currentEntry, secondEntry),
    'DuringInterruption',
  ),
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
      const refreshTransitionTypes: Array<string> = [];
      const directRefreshCommitted = Promise.withResolvers<void>();
      const firstReleased = vi.fn();
      const interruptedCurrentRouteRefresh = vi.fn();
      const rendered: Array<string> = [];
      const navigationApiLayer = NavigationApi.layerTest({
        getCurrentEntry: () => firstEntry,
        getCurrentUrl: () => firstEntry.url,
        getTransition: () => null,
        navigate: () => {
          throw new TypeError('Unexpected navigation.');
        },
        reloadDocument: () => undefined,
        replaceDocument: () => undefined,
        subscribe: () => () => undefined,
      });
      const flightClientLayer = FlightClient.layerTest({
        load: stubLoad((request) => {
          if (request._tag !== 'Mutation') {
            return Effect.die('Unexpected navigation Flight load.');
          }
          return request.id === 'first'
            ? Deferred.succeed(firstStarted, undefined).pipe(
                Effect.andThen(Deferred.await(firstResponse)),
              )
            : Deferred.succeed(secondStarted, undefined).pipe(
                Effect.andThen(Deferred.await(secondResponse)),
              );
        }),
        loadInitial: Effect.die('Unexpected initial Flight load.'),
      });
      const browserRendererLayer = BrowserRenderer.layerTest({
        commit: () => undefined,
        initialize: () => undefined,
        navigate: () => {
          throw new TypeError('Unexpected navigation render.');
        },
        refresh: (routeTree) => {
          rendered.push(routeTree.id);
          return {
            committed: Promise.resolve(),
            retired: Promise.withResolvers<void>().promise,
            discard: () => Promise.resolve(),
          };
        },
      });
      const routeLoaderLayer = RouteLoader.layerTest({
        invalidate: () => undefined,
        load: () => Effect.die('Unexpected route load.'),
        loadInitial: Effect.die('Unexpected initial route load.'),
        prepareRefresh: () => () => {
          directRefreshCommitted.resolve();
        },
      });
      const routeRefresherLayer = RouteRefresher.layerTest({
        interruptCurrentRouteRefresh: Effect.sync(interruptedCurrentRouteRefresh),
        refreshCurrentRoute: (transitionType) =>
          Effect.sync(() => refreshTransitionTypes.push(transitionType)).pipe(
            Effect.andThen(Deferred.succeed(currentRouteRefresh, undefined)),
          ),
        replace: () => Effect.void,
      });
      yield* listen(
        Layer.mergeAll(
          BrowserEffectRunner.layer,
          browserRendererLayer,
          flightClientLayer,
          navigationApiLayer,
          routeLoaderLayer,
          routeRefresherLayer,
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
      expect(interruptedCurrentRouteRefresh).toHaveBeenCalledOnce();
      expect(reactClient.transitionTypes).toEqual(['server-function']);
      yield* Deferred.succeed(
        firstResponse,
        makeFlight('older', 'first result', Effect.sync(firstReleased)),
      );

      const firstValue = yield* Effect.promise(() => firstResult);
      expect(firstValue).toBe('first result');
      yield* Deferred.await(currentRouteRefresh);
      expect(refreshTransitionTypes).toEqual(['server-function']);
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

it.effect('releases a visible Server Function refresh when its replacement commits', () =>
  Effect.gen(function* () {
    const browserRenderer = yield* BrowserRenderer.make;
    let published = Promise.withResolvers<BrowserRender>();
    browserRenderer.initialize(makeRouteTree('initial'), (render) => published.resolve(render));
    const released = vi.fn();
    const cached = vi.fn();
    yield* listen(
      Layer.mergeAll(
        BrowserEffectRunner.layer,
        BrowserRenderer.layerTest(browserRenderer),
        FlightClient.layerTest({
          load: stubLoad(() =>
            Effect.succeed({
              ...makeFlight('refreshed', 'saved', Effect.sync(released)),
              completed: Effect.never,
            }),
          ),
        }),
        NavigationApi.layerTest({
          getCurrentEntry: () => firstEntry,
          getCurrentUrl: () => firstEntry.url,
          getTransition: () => null,
          navigate: () => {
            throw new TypeError('Unexpected document navigation.');
          },
          reloadDocument: () => undefined,
          replaceDocument: () => undefined,
          subscribe: () => () => undefined,
        }),
        RouteLoader.layerTest({ invalidate: () => undefined, prepareRefresh: () => cached }),
        RouteRefresher.layerTest({ interruptCurrentRouteRefresh: Effect.void }),
      ),
    );

    const result = yield* Effect.promise(() => invokeServerFn('save'));
    expect(result).toBe('saved');
    const refresh = yield* Effect.promise(() => published.promise);
    browserRenderer.commit(refresh);

    // The refreshed page is still streaming while its replacement prepares.
    published = Promise.withResolvers<BrowserRender>();
    const replacement = browserRenderer.navigate(makeRouteTree('replacement'));
    const nextRender = yield* Effect.promise(() => published.promise);
    yield* Effect.yieldNow;
    expect(released).not.toHaveBeenCalled();

    browserRenderer.commit(nextRender);
    yield* Effect.promise(() => replacement.committed);
    yield* Effect.yieldNow;
    expect(released).toHaveBeenCalledOnce();
    expect(cached).not.toHaveBeenCalled();
  }).pipe(
    Effect.scoped,
    Effect.provideService(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
    ),
  ),
);

it.effect('releases a never-committed Server Function refresh after its successor commits', () =>
  Effect.gen(function* () {
    const browserRenderer = yield* BrowserRenderer.make;
    let published = Promise.withResolvers<BrowserRender>();
    browserRenderer.initialize(makeRouteTree('initial'), (render) => published.resolve(render));
    const released = vi.fn();
    const cached = vi.fn();
    yield* listen(
      Layer.mergeAll(
        BrowserEffectRunner.layer,
        BrowserRenderer.layerTest(browserRenderer),
        FlightClient.layerTest({
          load: stubLoad(() =>
            Effect.succeed(makeFlight('refreshed', 'saved', Effect.sync(released))),
          ),
        }),
        NavigationApi.layerTest({
          getCurrentEntry: () => firstEntry,
          getCurrentUrl: () => firstEntry.url,
          getTransition: () => null,
          navigate: () => {
            throw new TypeError('Unexpected document navigation.');
          },
          reloadDocument: () => undefined,
          replaceDocument: () => undefined,
          subscribe: () => () => undefined,
        }),
        RouteLoader.layerTest({ invalidate: () => undefined, prepareRefresh: () => cached }),
        RouteRefresher.layerTest({ interruptCurrentRouteRefresh: Effect.void }),
      ),
    );

    const result = yield* Effect.promise(() => invokeServerFn('save'));
    expect(result).toBe('saved');
    const refresh = yield* Effect.promise(() => published.promise);
    expect(refresh._tag).toBe('Refresh');

    // The first stream has ended, but React has not committed its refresh.
    published = Promise.withResolvers<BrowserRender>();
    const replacement = browserRenderer.refresh(makeRouteTree('replacement'));
    const nextRender = yield* Effect.promise(() => published.promise);
    yield* Effect.yieldNow;
    expect(released).not.toHaveBeenCalled();

    browserRenderer.commit(nextRender);
    yield* Effect.promise(() => replacement.committed);
    yield* Effect.yieldNow;
    expect(released).toHaveBeenCalledOnce();
    expect(cached).not.toHaveBeenCalled();
  }).pipe(
    Effect.scoped,
    Effect.provideService(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die('Unexpected HTTP request.')),
    ),
  ),
);
