import { Effect, FileSystem, Path, Schema } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { EnvironmentConfig } from './contract';

class DevSourceMapError extends Schema.TaggedError<DevSourceMapError>()('DevSourceMapError', {
  reason: Schema.Literal('InvalidRequest'),
}) {}

const sourceMapAsset = Effect.fnUntraced(function* (
  request: HttpServerRequest.HttpServerRequest,
  path: Path.Path,
) {
  const requestUrl = HttpServerRequest.toURL(request);
  if (requestUrl._tag === 'None') {
    return yield* new DevSourceMapError({ reason: 'InvalidRequest' });
  }

  const fileName = requestUrl.value.searchParams.get('fileName');
  const environmentName = requestUrl.value.searchParams.get('environmentName');
  if (fileName === null || (environmentName !== 'Client' && environmentName !== 'Server')) {
    return yield* new DevSourceMapError({ reason: 'InvalidRequest' });
  }

  const sourceMapName = path.basename(fileName.endsWith('.map') ? fileName : `${fileName}.map`);
  if (!sourceMapName.endsWith('.js.map')) {
    return yield* new DevSourceMapError({ reason: 'InvalidRequest' });
  }

  return { environmentName, sourceMapName } as const;
});

const SourceMapResponseOptions = {
  contentType: 'application/json',
  headers: {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
} as const;

export const makeDevSourceMapHttpEffect = Effect.fnUntraced(function* (applicationRoot: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return {
    httpEffect: HttpServerRequest.HttpServerRequest.use((request) =>
      sourceMapAsset(request, path).pipe(
        Effect.flatMap(({ environmentName, sourceMapName }) =>
          fileSystem.readFile(
            path.join(
              applicationRoot,
              environmentName === 'Client'
                ? EnvironmentConfig.development.clientOutputDir
                : EnvironmentConfig.development.serverOutputDir,
              sourceMapName,
            ),
          ),
        ),
        Effect.map((body) => HttpServerResponse.uint8Array(body, SourceMapResponseOptions)),
        Effect.catchTag('DevSourceMapError', () =>
          Effect.succeed(HttpServerResponse.empty({ status: 400 })),
        ),
        Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 404 })),
      ),
    ),
  };
});
