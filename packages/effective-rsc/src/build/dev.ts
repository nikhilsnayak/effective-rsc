import { Effect, Path, Schema } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

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
