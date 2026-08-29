import { Deferred, Effect, Layer, Path, Ref, Schema, ScopedRef, Stream } from 'effect';
import { HttpRouter, HttpServer } from 'effect/unstable/http';

import { resolveApplicationBuild } from './build';
import { loadServerBundle, makeRunnableHttpLayer } from './compiled-server';
import { DevClientOutputDir } from './contract';
import { Rspack, type RspackError, type RspackWatchEvent } from './rspack';
import { makeRspackDevConfig } from './rspack-config';
import { formatDuration, Terminal } from './terminal';

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

export type DevApplicationOptions = DevGenerationOptions;

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
type DevGenerationFailure = Effect.Error<ReturnType<typeof acquireDevGeneration>> | RspackError;

type DevGenerationState =
  | { readonly _tag: 'Unavailable' }
  | { readonly _tag: 'Ready'; readonly generation: DevGeneration };

export const makeDevGenerationStore = Effect.fnUntraced(function* (options: DevGenerationOptions) {
  const generation = yield* ScopedRef.make<DevGenerationState>(() => ({ _tag: 'Unavailable' }));
  const initialCompilation = yield* Deferred.make<DevGeneration, DevGenerationFailure>();
  const compilation = yield* Ref.make(initialCompilation);
  const update = Effect.fnUntraced(function* (event: RspackWatchEvent) {
    const current = yield* Ref.get(compilation);

    switch (event._tag) {
      case 'Building': {
        if (yield* Deferred.isDone(current)) {
          const next = yield* Deferred.make<DevGeneration, DevGenerationFailure>();
          yield* Ref.set(compilation, next);
        }
        return;
      }
      case 'Failed': {
        yield* Deferred.fail(current, event.error);
        return;
      }
      case 'Compiled': {
        yield* ScopedRef.set(
          generation,
          acquireDevGeneration({ ...options, compilation: event }).pipe(
            Effect.map((ready): DevGenerationState => ({
              _tag: 'Ready',
              generation: ready,
            })),
            Effect.tapError((error) => Deferred.fail(current, error)),
          ),
        );
        const ready = yield* ScopedRef.get(generation);
        if (ready._tag === 'Unavailable') {
          return yield* Effect.die(
            new TypeError('Expected the completed development generation to be available.'),
          );
        }
        yield* Deferred.succeed(current, ready.generation);
      }
    }
  });
  const httpEffect = Ref.get(compilation).pipe(
    Effect.flatMap(Deferred.await),
    Effect.flatMap((ready) => ready.httpEffect),
  );

  return {
    httpEffect,
    update,
  };
});

export const makeDevApplication = Effect.fnUntraced(function* ({
  hostname,
  port,
  root,
}: DevApplicationOptions) {
  const { applicationRoot, entries } = yield* resolveApplicationBuild({ root });
  const path = yield* Path.Path;
  const rspack = yield* Rspack;
  const generationStore = yield* makeDevGenerationStore({
    hostname,
    port,
    root: applicationRoot,
  });
  const update = Effect.fnUntraced(function* (event: RspackWatchEvent) {
    switch (event._tag) {
      case 'Building': {
        yield* generationStore.update(event);
        const firstChangedFile =
          event.changedFiles.find((file) => path.basename(file).includes('.')) ??
          event.changedFiles[0];
        const changedPath =
          firstChangedFile === undefined
            ? undefined
            : path.relative(applicationRoot, firstChangedFile);
        const subject = changedPath ?? 'application';

        yield* Effect.logInfo(`${Terminal.cyan('●')} Compiling ${subject}...`);
        return;
      }
      case 'Failed': {
        yield* generationStore.update(event);
        yield* Effect.logError(event.error);
        return;
      }
      case 'Compiled': {
        if (event.warnings !== undefined) {
          yield* Effect.logWarning(event.warnings);
        }
        yield* generationStore.update(event).pipe(
          Effect.tap(() => {
            const duration =
              event.duration === undefined ? '' : ` in ${formatDuration(event.duration)}`;
            const compilers = event.compilers
              .map(({ duration, name }) =>
                duration === undefined ? name : `${name} ${formatDuration(duration)}`,
              )
              .join(' · ');
            const details = compilers.length === 0 ? '' : `  ${Terminal.dim(compilers)}`;

            return Effect.logInfo(`${Terminal.green('✓')} Ready${duration}${details}`);
          }),
          Effect.catch((error) => Effect.logError(error)),
        );
      }
    }
  });
  const watch = rspack
    .watch(makeRspackDevConfig(applicationRoot, entries))
    .pipe(Stream.runForEach(update));

  return {
    httpEffect: generationStore.httpEffect,
    watch,
  };
});

type DevApplication = Effect.Success<ReturnType<typeof makeDevApplication>>;

export const launchDevApplication = Effect.fnUntraced(function* (application: DevApplication) {
  yield* HttpServer.logAddress;

  return yield* Effect.raceFirst(
    application.watch,
    Layer.launch(HttpServer.serve(application.httpEffect)),
  );
});

export const devApplication = Effect.fn('ersc/build/devApplication')(function* (
  options: DevApplicationOptions,
) {
  const application = yield* makeDevApplication(options).pipe(Effect.provide(Rspack.layer));

  return yield* launchDevApplication(application);
});
