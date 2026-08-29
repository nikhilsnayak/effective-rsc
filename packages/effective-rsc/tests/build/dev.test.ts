import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';

import { acquireDevGeneration, makeDevGenerationStore } from '../../src/build/dev';

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

it.effect('keeps the last ready generation when a replacement fails', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-store-' });
    const firstFilename = 'main.first.js';
    const failedFilename = 'main.failed.js';
    const secondFilename = 'main.second.js';

    yield* fileSystem.writeFileString(
      path.join(directory, firstFilename),
      serverBundleSource("HttpRouter.add('GET', '/first', HttpServerResponse.empty())"),
    );
    yield* fileSystem.writeFileString(
      path.join(directory, failedFilename),
      serverBundleSource("Layer.effectDiscard(Effect.fail('startup failed'))"),
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

    expect((yield* store.current)._tag).toBe('Unavailable');

    yield* store.publish({
      _tag: 'Compiled',
      hash: 'first',
      serverBundle: { filename: firstFilename, outputPath: directory },
    });
    const first = yield* store.current;
    expect(first._tag).toBe('Ready');
    if (first._tag === 'Ready') {
      expect(first.generation.hash).toBe('first');
    }

    const startupError = yield* store
      .publish({
        _tag: 'Compiled',
        hash: 'failed',
        serverBundle: { filename: failedFilename, outputPath: directory },
      })
      .pipe(Effect.flip);
    expect(startupError).toMatchObject({
      _tag: 'DevGenerationError',
      cause: 'startup failed',
    });

    const retained = yield* store.current;
    expect(retained._tag).toBe('Ready');
    if (retained._tag === 'Ready') {
      expect(retained.generation.hash).toBe('first');
    }

    yield* store.publish({
      _tag: 'Compiled',
      hash: 'second',
      serverBundle: { filename: secondFilename, outputPath: directory },
    });
    const second = yield* store.current;
    expect(second._tag).toBe('Ready');
    if (second._tag === 'Ready') {
      expect(second.generation.hash).toBe('second');
    }
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);
