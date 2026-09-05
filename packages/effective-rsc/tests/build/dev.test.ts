// oxlint-disable effecttsgo/global-fetch-in-effect -- These integration tests exercise Bun's native response body readers and disconnects.
import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Logger,
  Path,
  Ref,
  Schedule,
  Scope,
  Stream,
} from 'effect';
import { TestClock } from 'effect/testing';
import { HttpServer, HttpServerRequest } from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import * as Socket from 'effect/unstable/socket/Socket';

import { DevOutputDir } from '../../src/build/contract';
import {
  acquireDevGeneration,
  launchDevApplication,
  makeDevApplication,
  makeDevGenerationStore,
} from '../../src/build/dev';
import { makeDevChannel } from '../../src/build/dev-channel';
import { Rspack, RspackError } from '../../src/build/rspack';
import { Terminal } from '../../src/build/terminal';
import { DevChannelPath, DevRpcs } from '../../src/dev/channel';

const EffectModuleUrl = import.meta.resolve('effect');
const HttpModuleUrl = import.meta.resolve('effect/unstable/http');
const CompilationDetails = {
  clientHash: 'client',
  compilers: [
    { duration: 10, name: 'client' },
    { duration: 20, name: 'server' },
  ],
  duration: 20,
} as const;

const serverBundleSource = (httpLayer: string) => `
  import { Effect, FileSystem, Layer, Stream } from ${JSON.stringify(EffectModuleUrl)};
  import { HttpRouter, HttpServerResponse } from ${JSON.stringify(HttpModuleUrl)};

  export default {
    entryCssFiles: ['main.css'],
    entryJsFiles: ['main.js'],
  };
  export const HttpLayer = ${httpLayer};
  export const ServerLayer = Layer.empty;
`;

it.effect('acquires a complete development generation before returning it', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-generation-' });
    const readyFilename = 'main.ready.js';
    const failedFilename = 'main.failed.js';

    yield* fileSystem.writeFileString(
      path.join(directory, readyFilename),
      serverBundleSource(
        "HttpRouter.add('GET', '/ready', HttpServerResponse.text('generation ready'))",
      ),
    );
    yield* fileSystem.writeFileString(
      path.join(directory, failedFilename),
      serverBundleSource("Layer.effectDiscard(Effect.fail('startup failed'))"),
    );

    const generation = yield* acquireDevGeneration({
      compilation: {
        _tag: 'Compiled',
        ...CompilationDetails,
        hash: 'ready',
        serverBundle: { filename: readyFilename, outputPath: directory },
      },
      hostname: 'localhost',
      port: 18193,
      root: '/workspace',
    });

    expect(generation.hash).toBe('ready');
    const response = yield* generation.httpEffect.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request('http://localhost/ready')),
      ),
      Effect.forkChild,
      Effect.flatMap(Fiber.join),
    );
    expect(response.status).toBe(200);

    const startupError = yield* acquireDevGeneration({
      compilation: {
        _tag: 'Compiled',
        ...CompilationDetails,
        hash: 'failed',
        serverBundle: { filename: failedFilename, outputPath: directory },
      },
      hostname: 'localhost',
      port: 18193,
      root: '/workspace',
    }).pipe(Effect.flip);

    expect(startupError).toMatchObject({
      _tag: 'DevGenerationError',
      cause: 'startup failed',
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('waits for the current compilation outcome before dispatching', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-store-' });
    const firstFilename = 'main.first.js';
    const secondFilename = 'main.second.js';

    yield* fileSystem.writeFileString(
      path.join(directory, firstFilename),
      serverBundleSource("HttpRouter.add('GET', '/first', HttpServerResponse.empty())"),
    );
    yield* fileSystem.writeFileString(
      path.join(directory, secondFilename),
      serverBundleSource("HttpRouter.add('GET', '/second', HttpServerResponse.empty())"),
    );

    const store = yield* makeDevGenerationStore({
      hostname: 'localhost',
      port: 18193,
      root: '/workspace',
    });
    const request = (pathname: string) =>
      store.httpEffect.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request(`http://localhost${pathname}`)),
        ),
        Effect.forkChild,
        Effect.flatMap(Fiber.join),
      );

    yield* store.update({ _tag: 'Building', changedFiles: [] });
    const initialRequest = yield* request('/first').pipe(
      Effect.forkChild({ startImmediately: true }),
    );
    yield* Effect.yieldNow;
    expect(initialRequest.pollUnsafe()).toBeUndefined();

    yield* store.update({
      _tag: 'Compiled',
      ...CompilationDetails,
      hash: 'first',
      serverBundle: { filename: firstFilename, outputPath: directory },
    });
    const initialResponse = yield* Fiber.join(initialRequest);
    expect(initialResponse.status).toBe(204);

    yield* store.update({ _tag: 'Building', changedFiles: [] });
    const rebuildingRequest = yield* request('/first').pipe(
      Effect.forkChild({ startImmediately: true }),
    );
    yield* Effect.yieldNow;
    expect(rebuildingRequest.pollUnsafe()).toBeUndefined();

    const compilationError = new RspackError({
      message: 'Compilation failed.',
      cause: new Error('application.tsx: syntax error'),
      reason: 'BuildFailed',
    });
    yield* store.update({
      _tag: 'Failed',
      diagnostics: 'application.tsx: syntax error',
      error: compilationError,
    });
    const rebuildingError = yield* Fiber.join(rebuildingRequest).pipe(Effect.flip);
    const requestError = yield* request('/first').pipe(Effect.flip);
    expect(rebuildingError).toBe(compilationError);
    expect(requestError).toBe(compilationError);

    yield* store.update({ _tag: 'Building', changedFiles: [] });
    const recoveredRequest = yield* request('/second').pipe(
      Effect.forkChild({ startImmediately: true }),
    );
    yield* Effect.yieldNow;
    expect(recoveredRequest.pollUnsafe()).toBeUndefined();

    yield* store.update({
      _tag: 'Compiled',
      ...CompilationDetails,
      hash: 'second',
      serverBundle: { filename: secondFilename, outputPath: directory },
    });
    const recoveredResponse = yield* Fiber.join(recoveredRequest);
    expect(recoveredResponse.status).toBe(204);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

const streamServerBundleSource = (closedPath: string) =>
  serverBundleSource(`Layer.mergeAll(
    HttpRouter.add('GET', '/stream', Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.addFinalizer(() => fs.writeFileString(${JSON.stringify(closedPath + '.request')}, 'request/').pipe(Effect.orDie));
      return HttpServerResponse.stream(
        Stream.make(new TextEncoder().encode('first')).pipe(
          Stream.concat(Stream.fromEffect(Effect.sleep('1 second').pipe(Effect.as(new TextEncoder().encode('last'))))),
          Stream.onExit(() => fs.writeFileString(${JSON.stringify(closedPath + '.body')}, 'body/').pipe(Effect.orDie))
        )
      );
    })),
    HttpRouter.add('GET', '/pending', Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.addFinalizer(() => fs.writeFileString(${JSON.stringify(closedPath + '.pending')}, 'pending').pipe(Effect.orDie));
      yield* fs.writeFileString(${JSON.stringify(closedPath + '.started')}, 'started');
      return yield* Effect.never;
    })),
    Layer.effectDiscard(Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* Effect.addFinalizer(() => Effect.gen(function* () {
        const body = yield* fs.readFileString(${JSON.stringify(closedPath + '.body')});
        const request = yield* fs.readFileString(${JSON.stringify(closedPath + '.request')});
        const pending = yield* fs.readFileString(${JSON.stringify(closedPath + '.pending')});
        yield* fs.writeFileString(${JSON.stringify(closedPath)}, body + request + pending);
      }).pipe(Effect.orDie));
    }))
  )`);

const replacementScenario = (completion: 'Eof' | 'Disconnect' | 'Rebuild' | 'Shutdown') =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: 'ersc-dev-replacement-',
    });
    const closedPath = path.join(directory, 'closed');
    yield* fileSystem.writeFileString(
      path.join(directory, 'stream.js'),
      streamServerBundleSource(closedPath),
    );
    yield* fileSystem.writeFileString(
      path.join(directory, 'next.js'),
      serverBundleSource("HttpRouter.add('GET', '/stream', HttpServerResponse.text('next'))"),
    );
    yield* fileSystem.writeFileString(
      path.join(directory, 'failed.js'),
      serverBundleSource("Layer.effectDiscard(Effect.fail('startup failed'))"),
    );
    const scope = yield* Effect.scope;
    const generationScope = yield* Scope.fork(scope, 'sequential');
    const store = yield* makeDevGenerationStore({
      hostname: 'localhost',
      port: 18193,
      root: directory,
    }).pipe(Scope.provide(generationScope));
    const compile = (filename: string) =>
      store.update({
        _tag: 'Compiled',
        ...CompilationDetails,
        hash: filename,
        serverBundle: { filename, outputPath: directory },
      });
    yield* compile('stream.js');
    const server = yield* HttpServer.HttpServer;
    const serving = yield* launchDevApplication({
      closeDevChannel: Effect.void,
      httpEffect: store.httpEffect,
      watch: Effect.never,
    }).pipe(Effect.forkScoped({ startImmediately: true }));
    const url = HttpServer.formatAddress(server.address);
    const response = yield* Effect.promise(() => fetch(`${url}/stream`));
    const reader = response.body!.getReader();
    const first = yield* Effect.promise(() => reader.read());
    expect(new TextDecoder().decode(first.value)).toBe('first');
    yield* Effect.promise((signal) => fetch(`${url}/pending`, { signal })).pipe(
      Effect.forkScoped({ startImmediately: true }),
    );
    yield* fileSystem
      .exists(closedPath + '.started')
      .pipe(
        Effect.repeat({ while: (exists) => !exists, schedule: Schedule.spaced('10 millis') }),
        Effect.timeout('1 second'),
        TestClock.withLive,
      );

    yield* store.update({ _tag: 'Building', changedFiles: [] });
    yield* compile('failed.js').pipe(Effect.flip);
    const closedAfterFailure = yield* fileSystem.exists(closedPath);
    const pendingClosedAfterFailure = yield* fileSystem.exists(closedPath + '.pending');
    const bodyClosedAfterFailure = yield* fileSystem.exists(closedPath + '.body');
    expect(closedAfterFailure).toBe(false);
    expect(pendingClosedAfterFailure).toBe(false);
    expect(bodyClosedAfterFailure).toBe(false);

    switch (completion) {
      case 'Eof': {
        yield* TestClock.adjust('1 second');
        const last = yield* Effect.promise(() => reader.read());
        expect(new TextDecoder().decode(last.value)).toBe('last');
        const eof = yield* Effect.promise(() => reader.read());
        expect(eof.done).toBe(true);
        break;
      }
      case 'Disconnect':
        yield* Effect.promise(() => reader.cancel());
        break;
      case 'Rebuild':
      case 'Shutdown':
        break;
    }

    if (completion === 'Shutdown') {
      yield* Fiber.interrupt(serving);
      yield* Scope.close(generationScope, Exit.void);
    } else {
      yield* store.update({ _tag: 'Building', changedFiles: [] });
      yield* compile('next.js');
      const next = yield* Effect.promise(() =>
        fetch(`${url}/stream`).then((response) => response.text()),
      );
      expect(next).toBe('next');
    }
    // The generation finalizer reads these markers: disposal fails if request cleanup ran late.
    const cleanupOrder = yield* fileSystem.readFileString(closedPath);
    expect(cleanupOrder).toBe('body/request/pending');
    if (completion === 'Rebuild' || completion === 'Shutdown') {
      const result = yield* Effect.promise(() =>
        reader.read().then(
          () => 'Completed' as const,
          () => 'Interrupted' as const,
        ),
      );
      expect(result).toBe('Interrupted');
    }
  }).pipe(
    Effect.provide(
      BunHttpServer.layer({ hostname: '127.0.0.1', port: 0, disablePreemptiveShutdown: true }),
    ),
    Effect.scoped,
  );

it.effect('cleans up completed streams before disposing the replaced generation', () =>
  replacementScenario('Eof'),
);
it.effect('cleans up disconnected streams before disposing the replaced generation', () =>
  replacementScenario('Disconnect'),
);
it.effect('cancels pending handlers and streams before disposing the replaced generation', () =>
  replacementScenario('Rebuild'),
);
it.effect('cancels pending handlers and streams before disposing the generation on shutdown', () =>
  replacementScenario('Shutdown'),
);

it.effect('interrupts a candidate whose application startup never completes', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-startup-' });
    yield* fileSystem.writeFileString(
      path.join(directory, 'stalled.js'),
      serverBundleSource(
        "Layer.effectDiscard(Effect.logInfo('startup entered').pipe(Effect.andThen(Effect.never)))",
      ),
    );
    const store = yield* makeDevGenerationStore({
      hostname: 'localhost',
      port: 18193,
      root: directory,
    });
    const started = yield* Deferred.make<void>();
    const StartupLogger = Logger.layer([
      Logger.make(() => Deferred.doneUnsafe(started, Exit.void)),
    ]);
    const starting = yield* store
      .update({
        _tag: 'Compiled',
        ...CompilationDetails,
        hash: 'stalled',
        serverBundle: { filename: 'stalled.js', outputPath: directory },
      })
      .pipe(Effect.provide(StartupLogger), Effect.forkScoped({ startImmediately: true }));
    yield* Deferred.await(started);
    expect(starting.pollUnsafe()).toBeUndefined();
    yield* Fiber.interrupt(starting).pipe(Effect.timeout('1 second'), TestClock.withLive);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('continues watching after a generation fails to start', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-watch-' });
    const failedFilename = 'main.failed.js';
    const readyFilename = 'main.ready.js';

    yield* fileSystem.writeFileString(
      path.join(directory, failedFilename),
      serverBundleSource("Layer.effectDiscard(Effect.fail('startup failed'))"),
    );
    yield* fileSystem.writeFileString(
      path.join(directory, readyFilename),
      serverBundleSource("HttpRouter.add('GET', '/ready', HttpServerResponse.empty())"),
    );

    const RspackLayer = Layer.succeed(
      Rspack,
      Rspack.of({
        build: () => Effect.void,
        watch: () =>
          Stream.make(
            { _tag: 'Building', changedFiles: [] },
            {
              _tag: 'Compiled',
              ...CompilationDetails,
              hash: 'failed',
              serverBundle: { filename: failedFilename, outputPath: directory },
            },
            { _tag: 'Building', changedFiles: [] },
            {
              _tag: 'Compiled',
              ...CompilationDetails,
              hash: 'ready',
              serverBundle: { filename: readyFilename, outputPath: directory },
            },
          ),
      }),
    );
    const messages: Array<unknown> = [];
    const TestLoggerLayer = Logger.layer([
      Logger.make(({ message }) => {
        messages.push(message);
      }),
    ]);
    const application = yield* makeDevApplication({
      hostname: 'localhost',
      port: 18193,
      root: directory,
    }).pipe(Effect.provide(RspackLayer));

    yield* application.watch.pipe(Effect.provide(TestLoggerLayer));
    const response = yield* application.httpEffect.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request('http://localhost/ready')),
      ),
      Effect.forkChild,
      Effect.flatMap(Fiber.join),
    );

    expect(response.status).toBe(204);
    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual([`${Terminal.cyan('●')} Compiling application...`]);
    expect(messages[1]).toMatchObject([
      {
        _tag: 'DevGenerationError',
        cause: 'startup failed',
      },
    ]);
    expect(messages[2]).toEqual([`${Terminal.cyan('●')} Compiling application...`]);
    expect(messages[3]).toEqual([
      `${Terminal.green('✓')} Ready in 20 ms  ${Terminal.dim('client 10 ms · server 20 ms')}`,
    ]);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('removes output retained by an earlier development session', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-clean-' });
    const outputDirectory = path.join(directory, DevOutputDir);
    const staleAsset = path.join(outputDirectory, 'client', 'stale.js');

    yield* fileSystem.makeDirectory(path.dirname(staleAsset), { recursive: true });
    yield* fileSystem.writeFileString(staleAsset, 'stale');

    const RspackLayer = Layer.succeed(
      Rspack,
      Rspack.of({
        build: () => Effect.void,
        watch: () => Stream.empty,
      }),
    );

    yield* makeDevApplication({
      hostname: 'localhost',
      port: 18193,
      root: directory,
    }).pipe(Effect.provide(RspackLayer));

    const outputExists = yield* fileSystem.exists(outputDirectory);
    expect(outputExists).toBe(false);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('keeps one HTTP server across successful generations', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({
      prefix: 'ersc-dev-server-',
    });
    const firstFilename = 'main.first.js';
    const secondFilename = 'main.second.js';

    yield* fileSystem.writeFileString(
      path.join(directory, firstFilename),
      serverBundleSource("HttpRouter.add('GET', '/first', HttpServerResponse.empty())"),
    );
    yield* fileSystem.writeFileString(
      path.join(directory, secondFilename),
      serverBundleSource("HttpRouter.add('GET', '/second', HttpServerResponse.empty())"),
    );

    const serverStarted = yield* Deferred.make<void>();
    const serverStopped = yield* Deferred.make<void>();
    const serveCount = yield* Ref.make(0);
    const HttpServerLayer = Layer.succeed(
      HttpServer.HttpServer,
      HttpServer.make({
        address: { _tag: 'TcpAddress', hostname: 'localhost', port: 18193 },
        serve: () =>
          Effect.gen(function* () {
            yield* Ref.update(serveCount, (count) => count + 1);
            yield* Deferred.succeed(serverStarted, undefined);
            yield* Effect.addFinalizer(() => Deferred.succeed(serverStopped, undefined));
          }),
      }),
    );
    const RspackLayer = Layer.succeed(
      Rspack,
      Rspack.of({
        build: () => Effect.void,
        watch: () =>
          Stream.unwrap(
            Deferred.await(serverStarted).pipe(
              Effect.as(
                Stream.make(
                  { _tag: 'Building', changedFiles: [] },
                  {
                    _tag: 'Compiled',
                    ...CompilationDetails,
                    hash: 'first',
                    serverBundle: {
                      filename: firstFilename,
                      outputPath: directory,
                    },
                  },
                  { _tag: 'Building', changedFiles: [] },
                  {
                    _tag: 'Compiled',
                    ...CompilationDetails,
                    hash: 'second',
                    serverBundle: {
                      filename: secondFilename,
                      outputPath: directory,
                    },
                  },
                ),
              ),
            ),
          ),
      }),
    );

    const application = yield* makeDevApplication({
      hostname: 'localhost',
      port: 18193,
      root: directory,
    }).pipe(Effect.provide(RspackLayer));

    const logFiberIds: Array<number> = [];
    const TestLoggerLayer = Logger.layer([
      Logger.make(({ fiber, message }) => {
        const text = Array.isArray(message) ? message[0] : message;
        if (
          typeof text === 'string' &&
          (text.includes('effective-rsc') || text.includes('Compiling'))
        ) {
          logFiberIds.push(fiber.id);
        }
      }),
    ]);

    yield* launchDevApplication(application).pipe(
      Effect.provide(Layer.merge(HttpServerLayer, TestLoggerLayer)),
    );

    const served = yield* Ref.get(serveCount);
    const stopped = yield* Deferred.isDone(serverStopped);
    expect(served).toBe(1);
    expect(stopped).toBe(true);
    expect(new Set(logFiberIds)).toHaveLength(1);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('streams updates and stops development through the Effect RPC channel', () =>
  Effect.gen(function* () {
    const channel = yield* makeDevChannel;
    const server = yield* HttpServer.HttpServer;
    const serverUrl = HttpServer.formatAddress(server.address);
    const socketUrl = `${serverUrl.replace(/^http/, 'ws')}${DevChannelPath}`;
    const application = {
      closeDevChannel: channel.close,
      httpEffect: channel.httpEffect,
      watch: Effect.never,
    };
    const launched = yield* launchDevApplication(application).pipe(
      Effect.forkScoped({ startImmediately: true }),
    );
    const ProtocolLayer = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
      Layer.provide(Socket.layerWebSocket(socketUrl)),
      Layer.provide(
        Layer.succeed(
          Socket.WebSocketConstructor,
          (url) =>
            new WebSocket(url, {
              headers: { origin: new URL(serverUrl).origin },
            } as unknown as string | Array<string>),
        ),
      ),
      Layer.provide(RpcSerialization.layerJson),
    );
    const updates = yield* Effect.gen(function* () {
      const client = yield* RpcClient.make(DevRpcs);
      return yield* client.ObserveDevUpdates().pipe(Stream.take(1), Stream.runCollect);
    }).pipe(Effect.provide(ProtocolLayer), Effect.forkScoped({ startImmediately: true }));

    yield* channel.publishCompilation('client-one');
    const received = yield* Fiber.join(updates).pipe(
      Effect.timeout('1 second'),
      TestClock.withLive,
    );
    expect(Array.from(received)).toEqual([{ _tag: 'ClientUpdate', clientHash: 'client-one' }]);

    yield* Fiber.interrupt(launched).pipe(Effect.timeout('1 second'), TestClock.withLive);
  }).pipe(Effect.provide(BunHttpServer.layer({ hostname: '127.0.0.1', port: 0 })), Effect.scoped),
);
