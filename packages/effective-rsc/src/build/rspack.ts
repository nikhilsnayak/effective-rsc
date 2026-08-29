import rspack, { type Configuration, type MultiCompiler, type MultiStats } from '@rspack/core';
import { Context, Effect, Layer, Queue, Schema, Stream } from 'effect';

export class RspackError extends Schema.TaggedError<RspackError>()('RspackError', {
  message: Schema.String,
  cause: Schema.Defect(),
  reason: Schema.Literals(['CreateFailed', 'CompileFailed', 'BuildFailed', 'CloseFailed']),
}) {}

type RspackCompiler = MultiCompiler;
type RspackStats = MultiStats;
type RspackWatching = ReturnType<RspackCompiler['watch']>;

export type RspackWatchEvent =
  | {
      readonly _tag: 'Compiled';
      readonly hash: string;
      readonly warnings?: string;
    }
  | {
      readonly _tag: 'Failed';
      readonly error: RspackError;
    };

const Ansi = {
  cyan: '\u001B[36m',
  green: '\u001B[32m',
  red: '\u001B[31m',
  reset: '\u001B[0m',
  yellow: '\u001B[33m',
} as const;

const failureMessage = (message: string) => `${Ansi.red}✗${Ansi.reset} ${message}`;

const formatDuration = (milliseconds: number) =>
  milliseconds < 1_000 ? `${milliseconds} ms` : `${(milliseconds / 1_000).toFixed(2)} s`;

const buildDuration = (stats: RspackStats) => {
  const compilations = stats.stats;
  const starts = compilations.flatMap(({ startTime }) =>
    startTime === undefined ? [] : [startTime],
  );
  const ends = compilations.flatMap(({ endTime }) => (endTime === undefined ? [] : [endTime]));

  if (starts.length !== compilations.length || ends.length !== compilations.length) {
    return undefined;
  }

  return Math.max(...ends) - Math.min(...starts);
};

const closeCompiler = Effect.fnUntraced(function* (compiler: RspackCompiler) {
  yield* Effect.callback<void, RspackError>((resume) => {
    compiler.close((cause) => {
      resume(
        cause
          ? Effect.fail(
              new RspackError({
                message: failureMessage('Rspack failed to close the compiler.'),
                cause,
                reason: 'CloseFailed',
              }),
            )
          : Effect.void,
      );
    });
  });
});

const closeWatching = Effect.fnUntraced(function* (watching: RspackWatching) {
  yield* Effect.callback<void, RspackError>((resume) => {
    watching.close((cause) => {
      resume(
        cause
          ? Effect.fail(
              new RspackError({
                message: failureMessage('Rspack failed to stop watching the application.'),
                cause,
                reason: 'CloseFailed',
              }),
            )
          : Effect.void,
      );
    });
  });
});

const acquireCompiler = (configs: ReadonlyArray<Configuration>) =>
  Effect.acquireRelease(
    Effect.try({
      try: () => rspack([...configs]),
      catch: (cause) =>
        new RspackError({
          message: failureMessage('Rspack failed to create the application compiler.'),
          cause,
          reason: 'CreateFailed',
        }),
    }),
    (compiler) => closeCompiler(compiler).pipe(Effect.orDie),
  );

const compilationError = (cause: unknown) =>
  new RspackError({
    message: failureMessage('Rspack failed while compiling the application.'),
    cause,
    reason: 'CompileFailed',
  });

const missingStatsError = () =>
  new RspackError({
    message: failureMessage('Rspack completed without returning compilation statistics.'),
    cause: new Error('Missing Rspack compilation statistics.'),
    reason: 'CompileFailed',
  });

const statsDiagnostics = (stats: RspackStats) =>
  stats.toString({
    colors: true,
    preset: 'errors-warnings',
  });

const failedStatsError = (diagnostics: string) =>
  new RspackError({
    message: failureMessage('Rspack compiled the application with errors.'),
    cause: new Error(diagnostics),
    reason: 'BuildFailed',
  });

const watchEvent = (cause: Error | null, stats?: RspackStats): RspackWatchEvent => {
  if (cause) {
    return { _tag: 'Failed', error: compilationError(cause) };
  }
  if (!stats) {
    return { _tag: 'Failed', error: missingStatsError() };
  }
  if (stats.hasErrors()) {
    return { _tag: 'Failed', error: failedStatsError(statsDiagnostics(stats)) };
  }

  return {
    _tag: 'Compiled',
    hash: stats.hash,
    ...(stats.hasWarnings() ? { warnings: statsDiagnostics(stats) } : {}),
  };
};

const runCompiler = Effect.fnUntraced(function* (compiler: RspackCompiler) {
  return yield* Effect.callback<RspackStats, RspackError>((resume) => {
    compiler.run((cause, stats) => {
      if (cause) {
        resume(Effect.fail(compilationError(cause)));
        return;
      }
      if (!stats) {
        resume(Effect.fail(missingStatsError()));
        return;
      }

      resume(Effect.succeed(stats));
    });
  });
});

const reportStats = Effect.fnUntraced(function* (stats: RspackStats) {
  if (stats.hasErrors()) {
    return yield* failedStatsError(statsDiagnostics(stats));
  }
  if (stats.hasWarnings()) {
    yield* Effect.logWarning(
      `${Ansi.yellow}▲${Ansi.reset} Rspack compiled the application with warnings.\n${statsDiagnostics(stats)}`,
    );
  }

  const duration = buildDuration(stats);

  yield* Effect.logInfo(
    duration === undefined
      ? `${Ansi.green}✓${Ansi.reset} Build finished successfully.`
      : `${Ansi.green}✓${Ansi.reset} Build finished successfully in ${formatDuration(duration)}.`,
  );
});

const watchCompiler = (configs: ReadonlyArray<Configuration>) =>
  Stream.callback<RspackWatchEvent, RspackError>((queue) =>
    Effect.gen(function* () {
      const compiler = yield* acquireCompiler(configs);

      yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            compiler.watch({}, (cause, stats) => {
              Queue.offerUnsafe(queue, watchEvent(cause, stats));
            }),
          catch: (cause) => compilationError(cause),
        }),
        (watching) => closeWatching(watching).pipe(Effect.orDie),
      );
    }),
  );

export class Rspack extends Context.Service<Rspack>()('ersc/build/Rspack', {
  make: Effect.succeed({
    build: Effect.fn('Rspack.build')(function* (configs: ReadonlyArray<Configuration>) {
      yield* Effect.logInfo(`${Ansi.cyan}●${Ansi.reset} Building application with Rspack...`);

      const compiler = yield* acquireCompiler(configs);
      const stats = yield* runCompiler(compiler);

      yield* reportStats(stats);
    }),
    watch: watchCompiler,
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
