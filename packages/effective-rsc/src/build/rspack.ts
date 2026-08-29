import rspack, {
  type Compiler,
  type Configuration,
  type MultiCompiler,
  type MultiStats,
  type Stats,
} from '@rspack/core';
import { Context, Effect, Layer, Queue, Schema, Stream } from 'effect';

import { ServerEntryName } from './contract';
import { formatDuration, Terminal } from './terminal';

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
      readonly _tag: 'Building';
      readonly changedFiles: ReadonlyArray<string>;
    }
  | {
      readonly _tag: 'Compiled';
      readonly clientHash: string;
      readonly compilers: ReadonlyArray<{
        readonly duration?: number;
        readonly name: string;
      }>;
      readonly duration?: number;
      readonly hash: string;
      readonly serverBundle: {
        readonly filename: string;
        readonly outputPath: string;
      };
      readonly warnings?: string;
    }
  | {
      readonly _tag: 'Failed';
      readonly error: RspackError;
    };

const failureMessage = (message: string) => `${Terminal.red('✗')} ${message}`;

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

const compilerSummary = (stats: Stats) => {
  const { endTime, startTime } = stats;

  return {
    ...(startTime !== undefined && endTime !== undefined ? { duration: endTime - startTime } : {}),
    name: stats.compilation.name ?? 'compiler',
  };
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

const emittedServerBundle = (stats: RspackStats) => {
  const serverStats = stats.stats.find(({ compilation }) => compilation.name === 'server');
  const output = serverStats?.toJson({
    all: false,
    chunks: true,
    entrypoints: true,
    ids: true,
    outputPath: true,
  });
  const entryChunkIds = output?.entrypoints?.[ServerEntryName]?.chunks ?? [];
  const filenames =
    output?.chunks?.flatMap((chunk) =>
      chunk.entry && chunk.id !== undefined && entryChunkIds.includes(chunk.id)
        ? (chunk.files ?? []).filter((filename) => filename.endsWith('.js'))
        : [],
    ) ?? [];
  const filename = filenames[0];

  return output?.outputPath && filename !== undefined && filenames.length === 1
    ? { filename, outputPath: output.outputPath }
    : undefined;
};

const missingServerBundleError = () =>
  new RspackError({
    message: failureMessage('Rspack did not emit exactly one server entry bundle.'),
    cause: new Error('Missing or ambiguous server entry bundle in Rspack compilation statistics.'),
    reason: 'BuildFailed',
  });

const missingClientHashError = () =>
  new RspackError({
    message: failureMessage('Rspack did not emit a client compilation hash.'),
    cause: new Error('Missing client compilation hash in Rspack statistics.'),
    reason: 'BuildFailed',
  });

const clientCompilationHash = (stats: RspackStats) =>
  stats.stats.find(({ compilation }) => compilation.name === 'client')?.hash;

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
  const serverBundle = emittedServerBundle(stats);
  if (!serverBundle) {
    return { _tag: 'Failed', error: missingServerBundleError() };
  }
  const clientHash = clientCompilationHash(stats);
  if (typeof clientHash !== 'string') {
    return { _tag: 'Failed', error: missingClientHashError() };
  }
  const duration = buildDuration(stats);

  return {
    _tag: 'Compiled',
    clientHash,
    compilers: stats.stats.map(compilerSummary),
    ...(duration === undefined ? {} : { duration }),
    hash: stats.hash,
    serverBundle,
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
      `${Terminal.yellow('▲')} Rspack compiled the application with warnings.\n${statsDiagnostics(stats)}`,
    );
  }

  const duration = buildDuration(stats);

  yield* Effect.logInfo(
    duration === undefined
      ? `${Terminal.green('✓')} Build finished successfully.`
      : `${Terminal.green('✓')} Build finished successfully in ${formatDuration(duration)}.`,
  );
});

const watchCompiler = (configs: ReadonlyArray<Configuration>) =>
  Stream.callback<RspackWatchEvent, RspackError>((queue) =>
    Effect.gen(function* () {
      const compiler = yield* acquireCompiler(configs);
      // The RSC client plugin mutates its own ignored predicate during watch setup.
      const watchOptions = configs.map(() => ({}));
      let watchState: 'Idle' | 'Building' = 'Idle';

      compiler.hooks.watchRun.tap(
        { name: 'ersc:watch-state', stage: -10_000 },
        (childCompiler: Compiler) => {
          if (watchState === 'Idle') {
            watchState = 'Building';
            Queue.offerUnsafe(queue, {
              _tag: 'Building',
              changedFiles: Array.from(childCompiler.modifiedFiles ?? []),
            });
          }
        },
      );

      yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            compiler.watch(watchOptions, (cause, stats) => {
              watchState = 'Idle';
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
      yield* Effect.logInfo(`${Terminal.cyan('●')} Building application with Rspack...`);

      const compiler = yield* acquireCompiler(configs);
      const stats = yield* runCompiler(compiler);

      yield* reportStats(stats);
    }),
    watch: watchCompiler,
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
