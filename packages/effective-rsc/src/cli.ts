#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer, Schema } from 'effect';
import * as Command from 'effect/unstable/cli/Command';

import PackageJson from '../package.json' with { type: 'json' };
import { loadCompiledServer, makeRunnableServerLayer } from './build/compiled-server';
import { DefaultApplicationPort } from './server/server-config';

export class BuildModuleLoadError extends Schema.TaggedError<BuildModuleLoadError>()(
  'BuildModuleLoadError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const start = Effect.fn('effective-rsc/cli/start')(function* (root: string) {
  const bundle = yield* loadCompiledServer(root);
  const ServerLayer = yield* makeRunnableServerLayer({
    applicationPort: DefaultApplicationPort,
    bundle,
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

const startCommand = Command.make('start').pipe(
  Command.withDescription('Start the compiled application with Bun.'),
  Command.withHandler(() => start(process.cwd())),
);

const cli = Command.make('ersc').pipe(
  Command.withDescription('Build and run an effective-rsc application.'),
  Command.withSubcommands([buildCommand, startCommand]),
);

const program = Command.run(cli, { version: PackageJson.version }).pipe(
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(program);
