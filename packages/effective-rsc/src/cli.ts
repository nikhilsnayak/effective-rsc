import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, Layer, Schema } from 'effect';
import * as Command from 'effect/unstable/cli/Command';
import * as Flag from 'effect/unstable/cli/Flag';

import PackageJson from '../package.json' with { type: 'json' };
import { loadCompiledServer, makeRunnableServerLayer } from './build/compiled-server';
import { EnvironmentConfig } from './build/contract';
import {
  ApplicationIdleTimeoutSeconds,
  ApplicationMaxRequestBodySizeBytes,
  DefaultApplicationHostname,
  DefaultApplicationPort,
} from './server/server-config';

export class BuildModuleLoadError extends Schema.TaggedError<BuildModuleLoadError>()(
  'BuildModuleLoadError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class DevModuleLoadError extends Schema.TaggedError<DevModuleLoadError>()(
  'DevModuleLoadError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const start = Effect.fn('ersc/cli/start')(function* ({
  hostname,
  port,
  root,
}: {
  readonly hostname: string;
  readonly port: number;
  readonly root: string;
}) {
  const bundle = yield* loadCompiledServer(root);
  const ServerLayer = yield* makeRunnableServerLayer({
    bundle,
    clientAssetsCacheControl: EnvironmentConfig.production.clientAssetsCacheControl,
    clientOutputDir: EnvironmentConfig.production.clientOutputDir,
    hostname,
    port,
    root,
  });

  return yield* Layer.launch(ServerLayer);
});

const runBuild = Effect.fnUntraced(function* () {
  const { buildApplication } = yield* Effect.tryPromise({
    try: () => import('./build/build'),
    catch: (cause) =>
      new BuildModuleLoadError({
        message: 'Failed to load the effective-rsc application compiler.',
        cause,
      }),
  });

  yield* buildApplication({ root: process.cwd() });
});

const buildCommand = Command.make('build').pipe(
  Command.withDescription('Compile an effective-rsc application with Rspack.'),
  Command.withHandler(runBuild),
);

const hostname = Flag.string('hostname').pipe(
  Flag.withDescription('Hostname to bind (defaults to HOST or localhost)'),
  Flag.withFallbackConfig(
    Config.string('HOST').pipe(Config.withDefault(DefaultApplicationHostname)),
  ),
  Flag.withSchema(Schema.NonEmptyString),
);

const port = Flag.integer('port').pipe(
  Flag.withDescription(`Port to bind (defaults to PORT or ${DefaultApplicationPort})`),
  Flag.withFallbackConfig(Config.int('PORT').pipe(Config.withDefault(DefaultApplicationPort))),
  Flag.withSchema(
    Schema.Int.check(
      Schema.isBetween({
        minimum: 1,
        maximum: 65_535,
      }),
    ),
  ),
);

const runDev = Effect.fnUntraced(function* ({
  hostname,
  port,
}: {
  readonly hostname: string;
  readonly port: number;
}) {
  const { devApplication } = yield* Effect.tryPromise({
    try: () => import('./build/dev'),
    catch: (cause) =>
      new DevModuleLoadError({
        message: 'Failed to load the effective-rsc development compiler.',
        cause,
      }),
  });

  yield* devApplication({
    hostname,
    port,
    root: process.cwd(),
  }).pipe(
    Effect.provide(
      BunHttpServer.layer({
        development: true,
        hostname,
        idleTimeout: ApplicationIdleTimeoutSeconds,
        maxRequestBodySize: ApplicationMaxRequestBodySizeBytes,
        port,
      }),
    ),
    Effect.scoped,
  );
});

const devCommand = Command.make('dev', { hostname, port }).pipe(
  Command.withDescription('Start an effective-rsc application in development mode.'),
  Command.withHandler(runDev),
);

const startCommand = Command.make('start', { hostname, port }).pipe(
  Command.withDescription('Start the compiled application with Bun.'),
  Command.withHandler(({ hostname, port }) => start({ hostname, port, root: process.cwd() })),
);

const cli = Command.make('ersc').pipe(
  Command.withDescription('Build and run an effective-rsc application.'),
  Command.withSubcommands([devCommand, buildCommand, startCommand]),
);

const program = Command.run(cli, { version: PackageJson.version }).pipe(
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(program);
