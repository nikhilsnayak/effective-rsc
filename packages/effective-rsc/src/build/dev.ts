import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FiberSet, Layer, Path, Schema } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { DefaultApplicationPort } from '../server/server-config';
import { resolveApplicationBuild, type BuildOptions } from './build';
import { decodeServerBundle, makeRunnableHttpLayer, type ServerBundle } from './compiled-server';
import { type LoadServerBundle, makeDevConfig } from './config';
import { makeDevMiddleware, type WebHandler } from './dev-middleware';
import { Rsbuild } from './rsbuild';

export class DevServerError extends Schema.TaggedError<DevServerError>()('DevServerError', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

type ActiveHandler = {
  readonly dispose: () => Promise<void>;
  readonly handler: WebHandler;
};

const disposeHandler = Effect.fnUntraced(function* (activeHandler: ActiveHandler | null) {
  if (activeHandler === null) {
    return;
  }

  yield* Effect.tryPromise({
    try: activeHandler.dispose,
    catch: (cause) =>
      new DevServerError({
        message: 'Failed to dispose the previous development application.',
        cause,
      }),
  });
});

const makeApplicationReloader = Effect.fnUntraced(function* (root: string) {
  const path = yield* Path.Path;
  let activeHandler: ActiveHandler | null = null;
  const middleware = makeDevMiddleware(() => activeHandler?.handler ?? null);

  yield* Effect.addFinalizer(() => disposeHandler(activeHandler).pipe(Effect.orDie));

  const reload = Effect.fnUntraced(function* (loadServerBundle: LoadServerBundle) {
    const importedBundle = yield* Effect.tryPromise({
      try: loadServerBundle,
      catch: (cause) =>
        new DevServerError({
          message: 'Rsbuild failed to load the latest server bundle.',
          cause,
        }),
    });
    const bundle: ServerBundle = yield* decodeServerBundle(importedBundle).pipe(
      Effect.mapError(
        (cause) =>
          new DevServerError({
            message: 'Rsbuild loaded a server bundle with an invalid framework contract.',
            cause,
          }),
      ),
    );
    const HttpLayer = yield* makeRunnableHttpLayer({
      applicationPort: DefaultApplicationPort,
      bundle,
      root,
    }).pipe(Effect.provideService(Path.Path, path));
    const nextHandler = HttpRouter.toWebHandler(
      HttpLayer.pipe(Layer.provide(BunHttpPlatform.layer), Layer.provide(BunServices.layer)),
    );
    const previousHandler = activeHandler;

    activeHandler = nextHandler;
    yield* disposeHandler(previousHandler);
  });

  return { middleware, reload } as const;
});

export const dev = Effect.fn('effective-rsc/build/dev')(function* (options: BuildOptions) {
  const { applicationRoot, entries } = yield* resolveApplicationBuild(options);
  const applicationReloader = yield* makeApplicationReloader(applicationRoot);
  const runInDevScope = yield* FiberSet.makeRuntimePromise<never>();
  const rsbuild = yield* Rsbuild;
  const config = makeDevConfig(
    applicationRoot,
    entries,
    applicationReloader.middleware,
    (loadServerBundle) => runInDevScope(applicationReloader.reload(loadServerBundle)),
  );

  return yield* rsbuild.dev(applicationRoot, config);
});
