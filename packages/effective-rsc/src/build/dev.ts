import {
  Cause,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Path,
  Ref,
  Schema,
  Scope,
  ScopedRef,
  Stream,
} from 'effect';
import { HttpBody, HttpRouter, HttpServer, HttpServerResponse } from 'effect/unstable/http';

import PackageJson from '../../package.json' with { type: 'json' };
import { DevChannelPath } from '../dev/channel';
import { resolveApplicationBuild } from './build';
import { loadServerBundle, makeRunnableHttpLayer } from './compiled-server';
import { DevOutputDir, EnvironmentConfig } from './contract';
import { makeDevChannel } from './dev-channel';
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
    clientAssetsCacheControl: EnvironmentConfig.development.clientAssetsCacheControl,
    clientOutputDir: EnvironmentConfig.development.clientOutputDir,
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

  // Close request work before the generation's application services.
  const generationScope = yield* Effect.scope;
  const requests = yield* Scope.fork(generationScope, 'parallel');
  const ownRequest = Effect.withFiber((fiber) => {
    Fiber.runIn(fiber, requests);
    return Effect.void;
  });

  return {
    hash: compilation.hash,
    httpEffect: Effect.gen(function* () {
      yield* ownRequest;
      const response = yield* httpEffect;
      const body = response.body;
      if (body._tag !== 'Stream') {
        return response;
      }

      // Bun consumes the response body on a separate fiber after the handler returns.
      return HttpServerResponse.setBody(
        response,
        HttpBody.stream(
          Stream.onStart(body.stream, ownRequest),
          body.contentType,
          body.contentLength,
        ),
      );
    }),
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
        const compilationCompleted = yield* Deferred.isDone(current);
        if (compilationCompleted) {
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
            Effect.interruptible,
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
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const rspack = yield* Rspack;
  const channel = yield* makeDevChannel;

  yield* fileSystem.remove(path.join(applicationRoot, DevOutputDir), {
    force: true,
    recursive: true,
  });

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
        yield* channel.publishBuildFailure(event.diagnostics);
        yield* Effect.logError(event.error);
        return;
      }
      case 'Compiled': {
        if (event.warnings !== undefined) {
          yield* Effect.logWarning(event.warnings);
        }
        yield* generationStore.update(event).pipe(
          Effect.andThen(channel.publishCompilation(event.clientHash)),
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
          Effect.catch((error) =>
            channel
              .publishBuildFailure(Cause.pretty(Cause.fail(error)))
              .pipe(Effect.andThen(Effect.logError(error))),
          ),
        );
      }
    }
  });
  const watch = rspack
    .watch(
      makeRspackDevConfig(applicationRoot, entries, {
        onCompilationStart: channel.onCompilationStart,
        onServerComponentChanges: channel.onServerComponentChanges,
      }),
    )
    .pipe(Stream.runForEach(update));
  const httpEffect = yield* HttpRouter.toHttpEffect(
    HttpRouter.addAll([
      HttpRouter.route('GET', DevChannelPath, channel.httpEffect),
      HttpRouter.route('*', '/*', generationStore.httpEffect),
    ]),
  );

  return {
    closeDevChannel: channel.close,
    httpEffect,
    watch,
  };
});

type DevApplication = Effect.Success<ReturnType<typeof makeDevApplication>>;

export const launchDevApplication = Effect.fnUntraced(function* (application: DevApplication) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const server = yield* Layer.launch(HttpServer.serve(application.httpEffect)).pipe(
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* Effect.addFinalizer(() => application.closeDevChannel);
      const watch = HttpServer.addressFormattedWith((address) =>
        Effect.logInfo(
          `${Terminal.magenta('▌')} effective-rsc ${Terminal.dim(PackageJson.version)}  ${address}`,
        ),
      ).pipe(Effect.andThen(application.watch));

      return yield* Effect.raceFirst(watch, Fiber.join(server));
    }),
  );
});

export const devApplication = Effect.fn('ersc/build/devApplication')(function* (
  options: DevApplicationOptions,
) {
  const application = yield* makeDevApplication(options).pipe(Effect.provide(Rspack.layer));

  return yield* launchDevApplication(application);
});
