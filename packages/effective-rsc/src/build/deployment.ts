import { Duration, Effect, Path, Predicate, Schema } from 'effect';

import type { BuildContext, BuildHook } from './hook';
import { formatDuration, Terminal } from './terminal';

export class DeploymentBuildError extends Schema.TaggedError<DeploymentBuildError>()(
  'DeploymentBuildError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const decodeHookModule = Schema.decodeUnknownEffect(
  Schema.Struct({
    build: Schema.declare((input): input is BuildHook => Predicate.isFunction(input)),
  }),
);

export const runDeploymentBuild = Effect.fn('ersc/build/runDeploymentBuild')(function* (
  name: string,
  context: BuildContext,
) {
  const path = yield* Path.Path;

  yield* Effect.logInfo(`${Terminal.cyan('●')} Building deployment with ${name}...`);
  const [duration] = yield* Effect.gen(function* () {
    const entry = yield* Effect.try({
      try: () => Bun.resolveSync(`${name}/build`, context.root),
      catch: (cause) =>
        new DeploymentBuildError({ message: `Cannot resolve ${name}'s build hook.`, cause }),
    });
    const url = yield* path.toFileUrl(entry);
    const loaded = yield* Effect.tryPromise({
      try: (): Promise<unknown> => import(url.href),
      catch: (cause) =>
        new DeploymentBuildError({ message: `Cannot load ${name}'s build hook.`, cause }),
    });
    const module = yield* decodeHookModule(loaded);
    const buildEffect = yield* Effect.try({
      try: () => module.build(context),
      catch: (cause) => new DeploymentBuildError({ message: `${name}'s build hook threw.`, cause }),
    });
    if (!Effect.isEffect(buildEffect)) {
      return yield* new DeploymentBuildError({
        message: `${name}'s build hook must return an Effect.`,
        cause: buildEffect,
      });
    }
    yield* buildEffect;
  }).pipe(
    Effect.mapError(
      (cause) => new DeploymentBuildError({ message: `Deployment build ${name} failed.`, cause }),
    ),
    Effect.scoped,
    Effect.timed,
  );
  yield* Effect.logInfo(
    `${Terminal.green('✓')} Deployment built with ${name} in ${formatDuration(Math.round(Duration.toMillis(duration)))}.`,
  );
});
