import { Effect, FileSystem, Layer, Path, Schema, Types } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { ServerConfig } from '../server/server-config';

export class CompiledServerError extends Schema.TaggedError<CompiledServerError>()(
  'CompiledServerError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const ClientBootstrapScripts = Schema.NonEmptyArray(Schema.String);
const isClientBootstrapScripts = Schema.is(ClientBootstrapScripts);
const ClientStylesheets = Schema.NonEmptyArray(Schema.String);
const isClientStylesheets = Schema.is(ClientStylesheets);

type WithClientResources = {
  readonly entryCssFiles: typeof ClientStylesheets.Type;
  readonly entryJsFiles: typeof ClientBootstrapScripts.Type;
};

const CompiledApplication = Schema.declare(
  (input): input is WithClientResources =>
    typeof input === 'object' &&
    input !== null &&
    'entryCssFiles' in input &&
    'entryJsFiles' in input &&
    isClientStylesheets(input.entryCssFiles) &&
    isClientBootstrapScripts(input.entryJsFiles),
  { expected: "the compiled 'use server-entry' application" },
);

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
  default: CompiledApplication,
  HttpLayer: CompiledHttpLayer,
  ServerLayer: CompiledServerLayer,
});

export type ServerBundle = typeof ServerBundle.Type;

export const decodeServerBundle = Schema.decodeUnknownEffect(ServerBundle);

const makeServerConfigLayer = Effect.fnUntraced(function* ({
  applicationPort,
  bundle,
  root,
}: {
  readonly applicationPort: number;
  readonly bundle: ServerBundle;
  readonly root: string;
}) {
  const path = yield* Path.Path;

  return Layer.succeed(
    ServerConfig,
    ServerConfig.of({
      clientAssetsRoot: path.resolve(root, '.ersc/client'),
      clientBootstrapScripts: bundle.default.entryJsFiles,
      clientStylesheets: bundle.default.entryCssFiles,
      hostname: 'localhost',
      port: applicationPort,
    }),
  );
});

export const makeRunnableServerLayer = Effect.fnUntraced(function* ({
  applicationPort,
  bundle,
  root,
}: {
  readonly applicationPort: number;
  readonly bundle: ServerBundle;
  readonly root: string;
}) {
  const ServerConfigLayer = yield* makeServerConfigLayer({ applicationPort, bundle, root });

  return bundle.ServerLayer.pipe(Layer.provide(ServerConfigLayer));
});

export const makeRunnableHttpLayer = Effect.fnUntraced(function* ({
  applicationPort,
  bundle,
  root,
}: {
  readonly applicationPort: number;
  readonly bundle: ServerBundle;
  readonly root: string;
}) {
  const ServerConfigLayer = yield* makeServerConfigLayer({ applicationPort, bundle, root });

  return bundle.HttpLayer.pipe(Layer.provide(ServerConfigLayer));
});

export const loadCompiledServer = Effect.fnUntraced(function* (root: string) {
  const path = yield* Path.Path;
  const serverBundlePath = path.resolve(root, '.ersc/server/main.js');
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
