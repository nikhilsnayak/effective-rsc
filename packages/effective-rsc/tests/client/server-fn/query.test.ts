// oxlint-disable effecttsgo/async-function, effecttsgo/global-timers, effecttsgo/new-promise -- These tests model the native Promise boundary React gives a server reference, which is exactly what queryAtom adapts.
import { expect, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { matchServerFnQuery } from '../../../src/client/server-fn/protocol';
import { query, queryAtom } from '../../../src/client/server-fn/query';
import {
  ServerFnDefect,
  ServerFnInputError,
  ServerFnTransportError,
} from '../../../src/rsc/server-fn-error';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it('ignores a native Server Function call', () => {
  expect(matchServerFnQuery(['a', { cursor: 1 }])).toBeNull();
  expect(matchServerFnQuery([])).toBeNull();
});

it('ignores malformed query metadata', () => {
  const marker = Symbol.for('ersc/ServerFnQuery');
  for (const metadata of [null, undefined, false, 'query', {}, { signal: 'invalid' }]) {
    expect(matchServerFnQuery([{ id: 'ticket-1', [marker]: metadata }])).toBeNull();
  }
});

it('ignores query metadata whose inspection throws', () => {
  const marker = Symbol.for('ersc/ServerFnQuery');
  const fail = () => {
    throw new Error('Metadata inspection failed.');
  };
  for (const argument of [
    new Proxy({}, { has: fail }),
    {
      get [marker]() {
        return fail();
      },
    },
    {
      [marker]: {
        get signal() {
          return fail();
        },
      },
    },
  ]) {
    expect(matchServerFnQuery([argument])).toBeNull();
  }
});

it('carries the caller signal in a trailing argument and strips it from the model', async () => {
  const calls: Array<ReadonlyArray<unknown>> = [];
  const atom = queryAtom((...args: ReadonlyArray<unknown>) => {
    calls.push(args);
    return Promise.resolve('value');
  });
  const registry = AtomRegistry.make();
  registry.mount(atom);
  registry.set(atom, ['term', 7]);
  await settle();

  const [received] = calls;
  expect(received).toBeDefined();
  const matched = matchServerFnQuery(received!);
  expect(matched?.args).toEqual(['term', 7]);
  expect(matched?.signal).toBeInstanceOf(AbortSignal);
  expect(matched?.signal.aborted).toBe(false);
});

it('aborts the request in flight when a newer argument supersedes it', async () => {
  const signals: Array<AbortSignal> = [];
  const atom = queryAtom((...args: ReadonlyArray<unknown>) => {
    const matched = matchServerFnQuery(args);
    signals.push(matched!.signal);
    return new Promise<string>((resolve, reject) => {
      matched!.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      if (args[0] === 'second') {
        resolve('second value');
      }
    });
  });
  const registry = AtomRegistry.make();
  registry.mount(atom);

  registry.set(atom, ['first']);
  await settle();
  expect(signals[0]?.aborted).toBe(false);

  registry.set(atom, ['second']);
  await settle();

  expect(signals[0]?.aborted).toBe(true);
  expect(signals[1]?.aborted).toBe(false);
  const result = registry.get(atom);
  expect(AsyncResult.isSuccess(result) && result.value).toBe('second value');
});

it('interrupts an in-flight query on demand', async () => {
  const signals: Array<AbortSignal> = [];
  const atom = queryAtom((...args: ReadonlyArray<unknown>) => {
    signals.push(matchServerFnQuery(args)!.signal);
    return new Promise<string>(() => undefined);
  });
  const registry = AtomRegistry.make();
  registry.mount(atom);

  registry.set(atom, ['pending']);
  await settle();
  registry.set(atom, Atom.Interrupt);
  await settle();

  expect(signals[0]?.aborted).toBe(true);
  expect(AsyncResult.isInterrupted(registry.get(atom))).toBe(true);
});

it.effect('resolves a plain query and carries the caller signal', () =>
  Effect.gen(function* () {
    let received: ReadonlyArray<unknown> | undefined;
    const search = query((...args: ReadonlyArray<unknown>) => {
      received = args;
      return Promise.resolve('value');
    });

    const value = yield* search('term', 7);

    expect(value).toBe('value');
    const matched = matchServerFnQuery(received!);
    expect(matched?.args).toEqual(['term', 7]);
    expect(matched?.signal.aborted).toBe(false);
  }),
);

it.effect('aborts a plain query when the calling fiber is interrupted', () =>
  Effect.gen(function* () {
    let signal: AbortSignal | undefined;
    const search = query((...args: ReadonlyArray<unknown>) => {
      signal = matchServerFnQuery(args)!.signal;
      return new Promise<string>(() => undefined);
    });

    const fiber = yield* Effect.forkChild(search('pending'));
    yield* Effect.yieldNow;
    expect(signal?.aborted).toBe(false);

    yield* Fiber.interrupt(fiber);

    expect(signal?.aborted).toBe(true);
  }),
);

it.effect('reports a transport rejection as a ServerFnError without a digest', () =>
  Effect.gen(function* () {
    const search = query(() => Promise.reject<string>(new Error('boom')));

    const error = yield* Effect.flip(search());

    expect(error._tag).toBe('ServerFnTransportError');
    expect(error.detail?.message).toBe('boom');
  }),
);

it.effect('preserves framework errors through the value query adapter', () =>
  Effect.gen(function* () {
    const detail = { message: 'rejected', name: 'Error', stack: null };
    for (const failure of [
      new ServerFnDefect({ detail: null, digest: 'digest-1' }),
      new ServerFnInputError({ detail: { message: 'rejected', name: 'Error' } }),
      new ServerFnTransportError({ detail }),
    ]) {
      const search = query(() => Promise.reject<string>(failure));

      const queryError = yield* Effect.flip(search());

      expect(queryError).toBe(failure);
    }
  }),
);
