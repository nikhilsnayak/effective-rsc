import rspack, {
  type Compiler,
  type Configuration,
  type MultiCompiler,
  type MultiStats,
  type Stats,
} from '@rspack/core';
import { Context, Effect, Layer, Schema } from 'effect';

export class RspackError extends Schema.TaggedError<RspackError>()('RspackError', {
  message: Schema.String,
  cause: Schema.Defect(),
  reason: Schema.Literals(['CreateFailed', 'CompileFailed', 'BuildFailed', 'CloseFailed']),
}) {}

type RspackCompiler = Compiler | MultiCompiler;
type RspackStats = Stats | MultiStats;

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

const compilationStats = (stats: RspackStats): ReadonlyArray<Stats> =>
  'stats' in stats ? stats.stats : [stats];

const buildDuration = (stats: RspackStats) => {
  const compilations = compilationStats(stats);
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

const runCompiler = Effect.fnUntraced(function* (compiler: RspackCompiler) {
  return yield* Effect.callback<RspackStats, RspackError>((resume) => {
    compiler.run((cause, stats) => {
      if (cause) {
        resume(
          Effect.fail(
            new RspackError({
              message: failureMessage('Rspack failed while compiling the application.'),
              cause,
              reason: 'CompileFailed',
            }),
          ),
        );
        return;
      }
      if (!stats) {
        resume(
          Effect.fail(
            new RspackError({
              message: failureMessage('Rspack completed without returning compilation statistics.'),
              cause: new Error('Missing Rspack compilation statistics.'),
              reason: 'CompileFailed',
            }),
          ),
        );
        return;
      }

      resume(Effect.succeed(stats));
    });
  });
});

const reportStats = Effect.fnUntraced(function* (stats: RspackStats) {
  const diagnostics = stats.toString({
    colors: true,
    preset: 'errors-warnings',
  });

  if (stats.hasErrors()) {
    return yield* new RspackError({
      message: failureMessage('Rspack compiled the application with errors.'),
      cause: new Error(diagnostics),
      reason: 'BuildFailed',
    });
  }
  if (stats.hasWarnings()) {
    yield* Effect.logWarning(
      `${Ansi.yellow}▲${Ansi.reset} Rspack compiled the application with warnings.\n${diagnostics}`,
    );
  }

  const duration = buildDuration(stats);

  yield* Effect.logInfo(
    duration === undefined
      ? `${Ansi.green}✓${Ansi.reset} Build finished successfully.`
      : `${Ansi.green}✓${Ansi.reset} Build finished successfully in ${formatDuration(duration)}.`,
  );
});

export class Rspack extends Context.Service<Rspack>()('ersc/build/Rspack', {
  make: Effect.succeed({
    build: Effect.fn('Rspack.build')(function* (configs: ReadonlyArray<Configuration>) {
      yield* Effect.logInfo(`${Ansi.cyan}●${Ansi.reset} Building application with Rspack...`);

      const compiler = yield* Effect.acquireRelease(
        Effect.try({
          try: () => rspack([...configs]),
          catch: (cause) =>
            new RspackError({
              message: failureMessage('Rspack failed to create the application compiler.'),
              cause,
              reason: 'CreateFailed',
            }),
        }),
        (acquired) => closeCompiler(acquired).pipe(Effect.orDie),
      );
      const stats = yield* runCompiler(compiler);

      yield* reportStats(stats);
    }),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
