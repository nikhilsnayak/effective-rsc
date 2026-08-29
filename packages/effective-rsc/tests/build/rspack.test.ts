import { expect, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';
import { vi } from 'vitest';

const Mocks = vi.hoisted(() => ({ rspack: vi.fn() }));

vi.mock('@rspack/core', () => ({ default: Mocks.rspack }));

import { Rspack } from '../../src/build/rspack';

type FakeStats = {
  readonly hash: string;
  readonly stats: ReadonlyArray<{
    readonly compilation: { readonly name: string };
    readonly startTime: number;
    readonly endTime: number;
    readonly hash: string;
    readonly toJson: () => {
      readonly chunks: ReadonlyArray<{
        readonly entry: boolean;
        readonly files: ReadonlyArray<string>;
        readonly id: string;
      }>;
      readonly entrypoints: Record<string, { readonly chunks: ReadonlyArray<string> }>;
      readonly outputPath: string;
    };
  }>;
  readonly hasErrors: () => boolean;
  readonly hasWarnings: () => boolean;
  readonly toString: () => string;
};

type WatchCallback = (cause: Error | null, stats?: FakeStats) => void;
type WatchCompiler = {
  readonly modifiedFiles?: ReadonlySet<string>;
  readonly name: string;
};

const makeStats = ({
  diagnostics,
  errors = false,
  hash,
  warnings = false,
}: {
  readonly diagnostics: string;
  readonly errors?: boolean;
  readonly hash: string;
  readonly warnings?: boolean;
}): FakeStats => ({
  hash,
  stats: [
    {
      compilation: { name: 'client' },
      startTime: 10,
      endTime: 18,
      hash: `client-${hash}`,
      toJson: () => ({
        chunks: [],
        entrypoints: {},
        outputPath: '/workspace/.ersc/dev/client',
      }),
    },
    {
      compilation: { name: 'server' },
      startTime: 10,
      endTime: 20,
      hash: `server-${hash}`,
      toJson: () => ({
        chunks: [{ entry: true, files: [`main.${hash}.js`], id: 'main' }],
        entrypoints: { main: { chunks: ['main'] } },
        outputPath: '/workspace/.ersc/dev/server',
      }),
    },
  ],
  hasErrors: () => errors,
  hasWarnings: () => warnings,
  toString: () => diagnostics,
});

it.effect('streams aggregate compilation outcomes and closes the complete watch lifecycle', () => {
  const closeOrder: Array<string> = [];
  const watchRunHandlers: Array<(compiler: WatchCompiler) => void> = [];
  const beginCompilation = (name: string) =>
    watchRunHandlers.forEach((handler) => handler({ modifiedFiles: new Set(), name }));

  Mocks.rspack.mockReturnValue({
    close: (callback: (cause?: Error) => void) => {
      closeOrder.push('compiler');
      callback();
    },
    hooks: {
      watchRun: {
        tap: (_options: unknown, handler: (compiler: WatchCompiler) => void) => {
          watchRunHandlers.push(handler);
        },
      },
    },
    watch: (_options: unknown, callback: WatchCallback) => {
      beginCompilation('client');
      beginCompilation('server');
      callback(
        null,
        makeStats({ diagnostics: 'application.tsx: compile error', errors: true, hash: 'failed' }),
      );
      beginCompilation('client');
      callback(new Error('watch callback failed'));
      beginCompilation('client');
      beginCompilation('server');
      callback(
        null,
        makeStats({ diagnostics: 'application.tsx: warning', hash: 'ready', warnings: true }),
      );

      return {
        close: (close: (cause?: Error) => void) => {
          closeOrder.push('watching');
          close();
        },
      };
    },
  });

  return Effect.gen(function* () {
    const events = yield* Effect.gen(function* () {
      const rspack = yield* Rspack;
      return yield* rspack.watch([]).pipe(Stream.take(6), Stream.runCollect);
    }).pipe(Effect.provide(Rspack.layer), Effect.scoped);

    expect(Array.from(events)).toMatchObject([
      { _tag: 'Building', changedFiles: [] },
      { _tag: 'Failed', error: { reason: 'BuildFailed' } },
      { _tag: 'Building', changedFiles: [] },
      { _tag: 'Failed', error: { reason: 'CompileFailed' } },
      { _tag: 'Building', changedFiles: [] },
      {
        _tag: 'Compiled',
        clientHash: 'client-ready',
        compilers: [
          { duration: 8, name: 'client' },
          { duration: 10, name: 'server' },
        ],
        duration: 10,
        hash: 'ready',
        serverBundle: {
          filename: 'main.ready.js',
          outputPath: '/workspace/.ersc/dev/server',
        },
        warnings: 'application.tsx: warning',
      },
    ]);
    expect(closeOrder).toEqual(['watching', 'compiler']);
  });
});
