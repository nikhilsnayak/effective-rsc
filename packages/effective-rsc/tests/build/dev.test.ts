import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, Fiber, FileSystem, Layer, Logger, Path, Stream } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';

import {
  acquireDevGeneration,
  makeDevApplication,
  makeDevGenerationStore,
} from '../../src/build/dev';
import { Rspack, RspackError } from '../../src/build/rspack';

const EffectModuleUrl = import.meta.resolve('effect');
const HttpModuleUrl = import.meta.resolve('effect/unstable/http');

const serverBundleSource = (httpLayer: string) => `
  import { Effect, Layer } from ${JSON.stringify(EffectModuleUrl)};
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
    );
    expect(response.status).toBe(200);

    const startupError = yield* acquireDevGeneration({
      compilation: {
        _tag: 'Compiled',
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
      );

    yield* store.update({ _tag: 'Building' });
    const initialRequest = yield* request('/first').pipe(
      Effect.forkChild({ startImmediately: true }),
    );
    yield* Effect.yieldNow;
    expect(initialRequest.pollUnsafe()).toBeUndefined();

    yield* store.update({
      _tag: 'Compiled',
      hash: 'first',
      serverBundle: { filename: firstFilename, outputPath: directory },
    });
    expect((yield* Fiber.join(initialRequest)).status).toBe(204);

    yield* store.update({ _tag: 'Building' });
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
    yield* store.update({ _tag: 'Failed', error: compilationError });
    expect(yield* Fiber.join(rebuildingRequest).pipe(Effect.flip)).toBe(compilationError);
    expect(yield* request('/first').pipe(Effect.flip)).toBe(compilationError);

    yield* store.update({ _tag: 'Building' });
    const recoveredRequest = yield* request('/second').pipe(
      Effect.forkChild({ startImmediately: true }),
    );
    yield* Effect.yieldNow;
    expect(recoveredRequest.pollUnsafe()).toBeUndefined();

    yield* store.update({
      _tag: 'Compiled',
      hash: 'second',
      serverBundle: { filename: secondFilename, outputPath: directory },
    });
    expect((yield* Fiber.join(recoveredRequest)).status).toBe(204);
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
            { _tag: 'Building' },
            {
              _tag: 'Compiled',
              hash: 'failed',
              serverBundle: { filename: failedFilename, outputPath: directory },
            },
            { _tag: 'Building' },
            {
              _tag: 'Compiled',
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
    );

    expect(response.status).toBe(204);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject([
      {
        _tag: 'DevGenerationError',
        cause: 'startup failed',
      },
    ]);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);
