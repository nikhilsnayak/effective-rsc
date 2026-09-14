// oxlint-disable effecttsgo/async-function, effecttsgo/global-timers, effecttsgo/new-promise -- These tests model the native Promise boundary React gives a server reference, which is exactly what queryAtom adapts.
import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Stream } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { matchServerFnQuery, type MatchedQuery } from '../../../src/client/server-fn/protocol';
import { query, queryAtom, stream, streamAtom } from '../../../src/client/server-fn/query';
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
  const signal = new AbortController().signal;
  for (const metadata of [
    null,
    undefined,
    false,
    'query',
    {},
    { signal },
    { _tag: 'Query', signal: 'invalid' },
    { _tag: 'Stream', signal },
    { _tag: 'Stream', signal, completed: undefined },
    { _tag: 'Stream', signal, completed: {} },
    { _tag: 'Unknown', signal },
  ]) {
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
        _tag: 'Query',
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
  expect(matched?._tag).toBe('Query');
  expect(matched).not.toHaveProperty('completed');
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
    expect(matched?._tag).toBe('Query');
    expect(matched).not.toHaveProperty('completed');
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

it.effect('preserves framework errors through value and stream query adapters', () =>
  Effect.gen(function* () {
    const detail = { message: 'rejected', name: 'Error', stack: null };
    for (const failure of [
      new ServerFnDefect({ detail: null, digest: 'digest-1' }),
      new ServerFnInputError({ detail: { message: 'rejected', name: 'Error' } }),
      new ServerFnTransportError({ detail }),
    ]) {
      const search = query(() => Promise.reject<string>(failure));
      const read = stream(() => Promise.reject<ReadableStream<string>>(failure));

      const queryError = yield* Effect.flip(search());
      const streamError = yield* Effect.flip(Stream.runDrain(read()));

      expect(queryError).toBe(failure);
      expect(streamError).toBe(failure);
    }
  }),
);

it.effect('completes after both the returned stream and the Flight response finish', () =>
  Effect.gen(function* () {
    let signal: AbortSignal | undefined;
    const read = stream((...args: ReadonlyArray<unknown>) => {
      const matched = matchServerFnQuery(args)!;
      if (matched._tag !== 'Stream') {
        throw new TypeError('Expected stream metadata.');
      }
      signal = matched.signal;
      Deferred.doneUnsafe(matched.completed, Effect.void);
      return Promise.resolve(
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue('card');
            controller.close();
          },
        }),
      );
    });
    const cards = yield* Stream.runCollect(read());
    expect(cards).toEqual(['card']);
    expect(signal?.aborted).toBe(true);
  }),
);

it.effect('aborts the request when a consumer stops before the stream ends', () =>
  Effect.gen(function* () {
    let signal: AbortSignal | undefined;
    const read = stream((...args: ReadonlyArray<unknown>) => {
      signal = matchServerFnQuery(args)!.signal;
      return Promise.resolve(
        new ReadableStream<string>({
          start(controller) {
            controller.enqueue('card');
          },
        }),
      );
    });
    yield* Stream.runDrain(read().pipe(Stream.take(1)));
    expect(signal?.aborted).toBe(true);
  }),
);

it('keeps streamAtom waiting and supersedes pending Flight after the last item', async () => {
  const calls: MatchedQuery[] = [];
  const atom = streamAtom((...args: ReadonlyArray<unknown>) => {
    calls.push(matchServerFnQuery(args)!);
    return Promise.resolve(
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue(String(args[0]));
          controller.close();
        },
      }),
    );
  });
  const registry = AtomRegistry.make();
  try {
    registry.mount(atom);
    registry.set(atom, ['first']);
    await settle();
    expect(AsyncResult.getOrThrow(registry.get(atom))).toBe('first');
    expect(registry.get(atom).waiting).toBe(true);
    expect(calls[0]!.signal.aborted).toBe(false);

    registry.set(atom, ['second']);
    await settle();
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(AsyncResult.getOrThrow(registry.get(atom))).toBe('second');
    expect(registry.get(atom).waiting).toBe(true);

    const second = calls[1]!;
    if (second._tag !== 'Stream') {
      throw new TypeError('Expected stream metadata.');
    }
    Deferred.doneUnsafe(second.completed, Effect.void);
    await settle();
    expect(AsyncResult.getOrThrow(registry.get(atom))).toBe('second');
    expect(registry.get(atom).waiting).toBe(false);
  } finally {
    registry.dispose();
  }
});
