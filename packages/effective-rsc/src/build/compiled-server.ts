import { Effect, FileSystem, Layer, Path, Schema, Types } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { ServerConfig } from '../server/server-config';
import { BuildServerBundlePath, CompiledServerExportNames, PublicAssetsDir } from './contract';

export class CompiledServerError extends Schema.TaggedError<CompiledServerError>()(
  'CompiledServerError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const CompiledApplication = Schema.Struct({
  entryCssFiles: Schema.Array(Schema.String),
  entryJsFiles: Schema.NonEmptyArray(Schema.String),
});

const CompiledServerLayer = Schema.declare(
  (input): input is Layer.Layer<never, Types.unhandled, ServerConfig> => Layer.isLayer(input),
  { expected: 'the compiled effective-rsc ServerLayer' },
);

const CompiledHttpLayer = Schema.declare(
  (
    input,
  ): input is Layer.Layer<
    never,
    Types.unhandled,
    FileSystem.FileSystem | HttpRouter.HttpRouter | Path.Path | ServerConfig
  > => Layer.isLayer(input),
  { expected: 'the compiled effective-rsc HttpLayer' },
);

const ServerBundle = Schema.Struct({
  [CompiledServerExportNames.application]: CompiledApplication,
  [CompiledServerExportNames.httpLayer]: CompiledHttpLayer,
  [CompiledServerExportNames.serverLayer]: CompiledServerLayer,
});

export type ServerBundle = typeof ServerBundle.Type;

export const decodeServerBundle = Schema.decodeUnknownEffect(ServerBundle);

type RunnableLayerOptions = {
  readonly bundle: ServerBundle;
  readonly clientOutputDir: string;
  readonly hostname: string;
  readonly port: number;
  readonly root: string;
};

const makeServerConfigLayer = Effect.fnUntraced(function* ({
  bundle,
  clientOutputDir,
  hostname,
  port,
  root,
}: RunnableLayerOptions) {
  const path = yield* Path.Path;

  return Layer.succeed(
    ServerConfig,
    ServerConfig.of({
      clientAssetsRoot: path.resolve(root, clientOutputDir),
      clientBootstrapScripts: bundle[CompiledServerExportNames.application].entryJsFiles,
      clientStylesheets: bundle[CompiledServerExportNames.application].entryCssFiles,
      hostname,
      port,
      publicAssetsRoot: path.resolve(root, PublicAssetsDir),
    }),
  );
});

export const makeRunnableServerLayer = Effect.fnUntraced(function* (options: RunnableLayerOptions) {
  const ServerConfigLayer = yield* makeServerConfigLayer(options);

  return options.bundle[CompiledServerExportNames.serverLayer].pipe(
    Layer.provide(ServerConfigLayer),
  );
});

export const makeRunnableHttpLayer = Effect.fnUntraced(function* (options: RunnableLayerOptions) {
  const ServerConfigLayer = yield* makeServerConfigLayer(options);

  return options.bundle[CompiledServerExportNames.httpLayer].pipe(Layer.provide(ServerConfigLayer));
});

export const loadServerBundle = Effect.fnUntraced(function* (serverBundlePath: string) {
  const path = yield* Path.Path;
  const serverBundleUrl = yield* path.toFileUrl(serverBundlePath).pipe(
    Effect.mapError(
      (cause) =>
        new CompiledServerError({
          message: `Failed to resolve the server bundle at ${serverBundlePath}.`,
          cause,
        }),
    ),
  );
  const importedBundle = yield* Effect.tryPromise({
    try: (): Promise<unknown> => import(serverBundleUrl.href),
    catch: (cause) =>
      new CompiledServerError({
        message: `Failed to load the server bundle at ${serverBundlePath}.`,
        cause,
      }),
  });

  return yield* decodeServerBundle(importedBundle).pipe(
    Effect.mapError(
      (cause) =>
        new CompiledServerError({
          message: `The server bundle at ${serverBundlePath} has an invalid framework contract.`,
          cause,
        }),
    ),
  );
});

export const loadCompiledServer = Effect.fnUntraced(function* (root: string) {
  const path = yield* Path.Path;

  return yield* loadServerBundle(path.resolve(root, BuildServerBundlePath));
});
