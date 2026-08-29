import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';

import { acquireDevGeneration } from '../../src/build/dev';

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
