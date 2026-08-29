import { Effect, FileSystem, Layer, Path, Schema, Types } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { ServerConfig } from '../server/server-config';
import {
  BuildClientOutputDir,
  BuildServerBundlePath,
  CompiledServerExportNames,
  PublicAssetsDir,
} from './contract';

export class CompiledServerError extends Schema.TaggedError<CompiledServerError>()(
  'CompiledServerError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const CompiledApplication = Schema.Struct({
  entryCssFiles: Schema.NonEmptyArray(Schema.String),
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
    HttpRouter.HttpRouter,
    Types.unhandled,
    FileSystem.FileSystem | Path.Path | ServerConfig
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
  readonly hostname: string;
  readonly port: number;
  readonly root: string;
};

const makeServerConfigLayer = Effect.fnUntraced(function* ({
  bundle,
  hostname,
  port,
  root,
}: RunnableLayerOptions) {
  const path = yield* Path.Path;

  return Layer.succeed(
    ServerConfig,
    ServerConfig.of({
      clientAssetsRoot: path.resolve(root, BuildClientOutputDir),
      clientBootstrapScripts: bundle[CompiledServerExportNames.application].entryJsFiles,
      clientStylesheets: bundle[CompiledServerExportNames.application].entryCssFiles,
      hostname,
      port,
      publicAssetsRoot: path.resolve(root, PublicAssetsDir),
    }),
  );
});

export const makeRunnableServerLayer = Effect.fnUntraced(function* ({
  bundle,
  hostname,
  port,
  root,
}: RunnableLayerOptions) {
  const ServerConfigLayer = yield* makeServerConfigLayer({ bundle, hostname, port, root });

  return bundle[CompiledServerExportNames.serverLayer].pipe(Layer.provide(ServerConfigLayer));
});

export const makeRunnableHttpLayer = Effect.fnUntraced(function* ({
  bundle,
  hostname,
  port,
  root,
}: RunnableLayerOptions) {
  const ServerConfigLayer = yield* makeServerConfigLayer({ bundle, hostname, port, root });

  return bundle[CompiledServerExportNames.httpLayer].pipe(Layer.provide(ServerConfigLayer));
});

export const loadCompiledServer = Effect.fnUntraced(function* (root: string) {
  const path = yield* Path.Path;
  const serverBundlePath = path.resolve(root, BuildServerBundlePath);
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
