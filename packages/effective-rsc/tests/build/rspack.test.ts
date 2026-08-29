import { expect, it } from '@effect/vitest';
import { Effect, Stream } from 'effect';
import { vi } from 'vitest';

const Mocks = vi.hoisted(() => ({ rspack: vi.fn() }));

vi.mock('@rspack/core', () => ({ default: Mocks.rspack }));

import { Rspack } from '../../src/build/rspack';

type FakeStats = {
  readonly hash: string;
  readonly stats: ReadonlyArray<{ readonly startTime: number; readonly endTime: number }>;
  readonly hasErrors: () => boolean;
  readonly hasWarnings: () => boolean;
  readonly toString: () => string;
};

type WatchCallback = (cause: Error | null, stats?: FakeStats) => void;

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
  stats: [{ startTime: 10, endTime: 20 }],
  hasErrors: () => errors,
  hasWarnings: () => warnings,
  toString: () => diagnostics,
});

it.effect('streams aggregate compilation outcomes and closes the complete watch lifecycle', () => {
  const closeOrder: Array<string> = [];

  Mocks.rspack.mockReturnValue({
    close: (callback: (cause?: Error) => void) => {
      closeOrder.push('compiler');
      callback();
    },
    watch: (_options: unknown, callback: WatchCallback) => {
      callback(
        null,
        makeStats({ diagnostics: 'application.tsx: compile error', errors: true, hash: 'failed' }),
      );
      callback(new Error('watch callback failed'));
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
      return yield* rspack.watch([]).pipe(Stream.take(3), Stream.runCollect);
    }).pipe(Effect.provide(Rspack.layer), Effect.scoped);

    expect(Array.from(events)).toMatchObject([
      { _tag: 'Failed', error: { reason: 'BuildFailed' } },
      { _tag: 'Failed', error: { reason: 'CompileFailed' } },
      { _tag: 'Compiled', hash: 'ready', warnings: 'application.tsx: warning' },
    ]);
    expect(closeOrder).toEqual(['watching', 'compiler']);
  });
});
