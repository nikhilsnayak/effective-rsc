import * as BunServices from '@effect/platform-bun/BunServices';
import { expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { EnvironmentConfig } from '../../src/build/contract';
import { makeDevSourceMapHttpEffect } from '../../src/build/dev-source-map';

it.effect('serves only development JavaScript source maps from the selected runtime graph', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-source-map-' });
    const clientRoot = path.join(root, EnvironmentConfig.development.clientOutputDir);
    const serverRoot = path.join(root, EnvironmentConfig.development.serverOutputDir);
    yield* fileSystem.makeDirectory(clientRoot, { recursive: true });
    yield* fileSystem.makeDirectory(serverRoot, { recursive: true });
    yield* fileSystem.writeFileString(path.join(clientRoot, 'client.js.map'), '{"graph":"client"}');
    yield* fileSystem.writeFileString(path.join(serverRoot, 'server.js.map'), '{"graph":"server"}');
    yield* fileSystem.writeFileString(path.join(root, 'outside.js.map'), '{"outside":true}');

    const { httpEffect } = yield* makeDevSourceMapHttpEffect(root);
    const request = (fileName: string, environmentName: string) =>
      httpEffect.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(
            new Request(
              `http://localhost/_ersc/dev/source-map?fileName=${encodeURIComponent(fileName)}&environmentName=${encodeURIComponent(environmentName)}`,
            ),
          ),
        ),
      );

    const clientResponse = yield* request('/build/client.js', 'Client');
    const client = HttpServerResponse.toWeb(clientResponse);
    expect(client.status).toBe(200);
    expect(client.headers.get('cache-control')).toBe('no-store');
    expect(client.headers.get('content-type')).toBe('application/json');
    expect(client.headers.get('x-content-type-options')).toBe('nosniff');
    const clientSourceMap = yield* Effect.promise(() => client.text());
    expect(clientSourceMap).toBe('{"graph":"client"}');

    const serverResponse = yield* request('file:///build/server.js.map', 'Server');
    const server = HttpServerResponse.toWeb(serverResponse);
    expect(server.status).toBe(200);
    const serverSourceMap = yield* Effect.promise(() => server.text());
    expect(serverSourceMap).toBe('{"graph":"server"}');

    const outsideResponse = yield* request(path.join(root, 'outside.js'), 'Server');
    const outside = HttpServerResponse.toWeb(outsideResponse);
    expect(outside.status).toBe(404);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);

it.effect('rejects malformed source-map requests and reports absent compilation assets', () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: 'ersc-dev-source-map-' });
    const { httpEffect } = yield* makeDevSourceMapHttpEffect(root);
    const request = (url: string) =>
      httpEffect.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request(url)),
        ),
      );

    for (const url of [
      'http://localhost/_ersc/dev/source-map',
      'http://localhost/_ersc/dev/source-map?fileName=main.css&environmentName=Client',
      'http://localhost/_ersc/dev/source-map?fileName=main.js&environmentName=Unknown',
    ]) {
      const response = yield* request(url);
      expect(response.status).toBe(400);
    }

    const missing = yield* request(
      'http://localhost/_ersc/dev/source-map?fileName=missing.js&environmentName=Server',
    );
    expect(missing.status).toBe(404);
  }).pipe(Effect.provide(BunServices.layer), Effect.scoped),
);
