import { Effect, Path, Schema, ScopedRef } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { loadServerBundle, makeRunnableHttpLayer } from './compiled-server';
import { DevClientOutputDir } from './contract';
import type { RspackWatchEvent } from './rspack';

type RspackCompilation = Extract<RspackWatchEvent, { readonly _tag: 'Compiled' }>;

export class DevGenerationError extends Schema.TaggedError<DevGenerationError>()(
  'DevGenerationError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

type AcquireDevGenerationOptions = {
  readonly compilation: RspackCompilation;
  readonly hostname: string;
  readonly port: number;
  readonly root: string;
};

type DevGenerationOptions = Omit<AcquireDevGenerationOptions, 'compilation'>;

export const acquireDevGeneration = Effect.fnUntraced(function* ({
  compilation,
  hostname,
  port,
  root,
}: AcquireDevGenerationOptions) {
  const path = yield* Path.Path;
  const bundle = yield* loadServerBundle(
    path.resolve(compilation.serverBundle.outputPath, compilation.serverBundle.filename),
  );
  const HttpLayer = yield* makeRunnableHttpLayer({
    bundle,
    clientOutputDir: DevClientOutputDir,
    hostname,
    port,
    root,
  });
  const httpEffect = yield* HttpRouter.toHttpEffect(HttpLayer).pipe(
    Effect.mapError(
      (cause) =>
        new DevGenerationError({
          message: `Failed to start development generation ${compilation.hash}.`,
          cause,
        }),
    ),
  );

  return {
    hash: compilation.hash,
    httpEffect,
  };
});

type DevGeneration = Effect.Success<ReturnType<typeof acquireDevGeneration>>;

type DevGenerationState =
  | { readonly _tag: 'Unavailable' }
  | { readonly _tag: 'Ready'; readonly generation: DevGeneration };

const UnavailableResponse = HttpServerResponse.text('The application is compiling.', {
  headers: { 'retry-after': '1' },
  status: 503,
});

export const makeDevGenerationStore = Effect.fnUntraced(function* (options: DevGenerationOptions) {
  const state = yield* ScopedRef.make<DevGenerationState>(() => ({ _tag: 'Unavailable' }));
  const publish = Effect.fnUntraced(function* (compilation: RspackCompilation) {
    yield* ScopedRef.set(
      state,
      acquireDevGeneration({ ...options, compilation }).pipe(
        Effect.map((generation): DevGenerationState => ({
          _tag: 'Ready',
          generation,
        })),
      ),
    );
  });
  const httpEffect = ScopedRef.get(state).pipe(
    Effect.flatMap((current) =>
      current._tag === 'Unavailable'
        ? Effect.succeed(UnavailableResponse)
        : current.generation.httpEffect,
    ),
  );

  return {
    httpEffect,
    publish,
  };
});
