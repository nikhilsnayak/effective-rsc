#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer } from 'effect';
import * as Command from 'effect/unstable/cli/Command';

import { build } from './build/build';
import { loadCompiledServer, makeRunnableServerLayer } from './build/compiled-server';
import { dev } from './build/dev';
import { Rsbuild } from './build/rsbuild';
import { DefaultApplicationPort } from './server/server-config';

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
  yield* build({ root: process.cwd() }).pipe(Effect.scoped);
});

const runDev = Effect.fnUntraced(function* () {
  return yield* dev({ root: process.cwd() }).pipe(Effect.scoped);
});

const devCommand = Command.make('dev').pipe(
  Command.withDescription('Run an effective-rsc application in development mode.'),
  Command.withHandler(runDev),
);

const buildCommand = Command.make('build').pipe(
  Command.withDescription('Compile an effective-rsc application with Rsbuild.'),
  Command.withHandler(runBuild),
);

const startCommand = Command.make('start').pipe(
  Command.withDescription('Start the compiled application with Bun.'),
  Command.withHandler(() => start(process.cwd())),
);

const cli = Command.make('ersc').pipe(
  Command.withDescription('Build and run an effective-rsc application.'),
  Command.withSubcommands([devCommand, buildCommand, startCommand]),
);

const program = Command.run(cli, { version: '0.0.0' }).pipe(
  Effect.provide(Layer.mergeAll(Rsbuild.layer, BunServices.layer)),
);

BunRuntime.runMain(program);
