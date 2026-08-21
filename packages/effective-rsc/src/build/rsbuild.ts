import {
  createRsbuild,
  type BuildResult,
  type RsbuildConfig,
  type StartDevServerResult,
} from '@rsbuild/core';
import { Context, Effect, Layer, Schema } from 'effect';

export class RsbuildError extends Schema.TaggedError<RsbuildError>()('RsbuildError', {
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

const closeBuild = Effect.fnUntraced(function* (result: BuildResult) {
  yield* Effect.tryPromise({
    try: () => result.close(),
    catch: (cause) =>
      new RsbuildError({
        message: 'Rsbuild failed to close the build.',
        cause,
      }),
  });
});

const closeDevServer = Effect.fnUntraced(function* (result: StartDevServerResult) {
  yield* Effect.tryPromise({
    try: () => result.server.close(),
    catch: (cause) =>
      new RsbuildError({
        message: 'Rsbuild failed to close the development server.',
        cause,
      }),
  });
});

export class Rsbuild extends Context.Service<Rsbuild>()('effective-rsc/build/Rsbuild', {
  make: Effect.succeed({
    build: Effect.fn('Rsbuild.build')(function* (root: string, config: RsbuildConfig) {
      yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            createRsbuild({
              callerName: 'effective-rsc',
              config,
              cwd: root,
            }).then((rsbuild) => rsbuild.build()),
          catch: (cause) =>
            new RsbuildError({
              message: 'Rsbuild failed to compile the application.',
              cause,
            }),
        }),
        (result) => closeBuild(result).pipe(Effect.orDie),
      );
    }),
    dev: Effect.fn('Rsbuild.dev')(function* (root: string, config: RsbuildConfig) {
      yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () =>
            createRsbuild({
              callerName: 'effective-rsc',
              config,
              cwd: root,
            }).then((rsbuild) => rsbuild.startDevServer()),
          catch: (cause) =>
            new RsbuildError({
              message: 'Rsbuild failed to start the development server.',
              cause,
            }),
        }),
        (result) => closeDevServer(result).pipe(Effect.orDie),
      );

      return yield* Effect.never;
    }),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
