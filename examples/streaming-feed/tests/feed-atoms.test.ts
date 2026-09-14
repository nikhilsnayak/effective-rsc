import { describe, expect, it } from '@effect/vitest';
import { Cause, Deferred, Effect, Stream } from 'effect';
import { AsyncResult, Atom, AtomRegistry } from 'effect/unstable/reactivity';
import type { ServerFnError } from 'effective-rsc/client';
import { vi } from 'vitest';

import { feedAtom } from '../src/feed-atoms';
import { type FeedItem, PageSize } from '../src/model';

const { readPage } = vi.hoisted(() => ({
  readPage: vi.fn<(input: { after: number }) => Stream.Stream<FeedItem, ServerFnError>>(),
}));

vi.mock('effective-rsc/client', () => ({ ServerFn: { stream: () => readPage } }));
vi.mock('../src/server-functions', () => ({ streamFeed: vi.fn() }));

const entries: FeedItem[] = Array.from({ length: 18 }, (_, index) => ({
  id: index + 1,
  content: `Note ${index + 1}`,
}));
const registry = Effect.acquireRelease(
  Effect.sync(() =>
    AtomRegistry.make({
      initialValues: [
        [
          feedAtom,
          AsyncResult.success({ items: entries.slice(0, PageSize), total: entries.length }),
        ],
      ],
    }),
  ),
  (value) => Effect.sync(() => value.dispose()),
);

describe('feed atom', () => {
  it.effect('seeds without fetching and accumulates every item in zero-delay pages', () =>
    Effect.gen(function* () {
      readPage.mockClear();
      readPage.mockImplementation(({ after }) => {
        return Stream.fromIterable(entries.slice(after, after + PageSize));
      });
      const current = yield* registry;
      yield* AtomRegistry.mount(current, feedAtom);
      const initial = AsyncResult.getOrThrow(current.get(feedAtom));
      expect(initial.items).toEqual(entries.slice(0, PageSize));
      expect(readPage).not.toHaveBeenCalled();
      for (const count of [12, 18]) {
        current.set(feedAtom, undefined);
        yield* AtomRegistry.getResult(current, feedAtom, { suspendOnWaiting: true });
        const result = AsyncResult.getOrThrow(current.get(feedAtom));
        expect(result.items).toEqual(entries.slice(0, count));
      }
      current.set(feedAtom, undefined);
      yield* AtomRegistry.getResult(current, feedAtom, { suspendOnWaiting: true });
      expect(readPage.mock.calls).toEqual([[{ after: 6 }], [{ after: 12 }]]);
    }),
  );

  it.effect('appends arrivals before the page completes without another action', () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>();
      readPage.mockImplementation(() =>
        Stream.make(entries[6]!).pipe(
          Stream.concat(
            Stream.fromEffect(Deferred.await(release)).pipe(
              Stream.flatMap(() => Stream.fromIterable(entries.slice(7, 12))),
            ),
          ),
        ),
      );
      const current = yield* registry;
      yield* AtomRegistry.mount(current, feedAtom);
      current.set(feedAtom, undefined);
      expect(AsyncResult.getOrThrow(current.get(feedAtom)).items).toEqual(entries.slice(0, 7));
      expect(current.get(feedAtom).waiting).toBe(true);
      yield* Deferred.succeed(release, undefined);
      yield* AtomRegistry.getResult(current, feedAtom, { suspendOnWaiting: true });
      expect(AsyncResult.getOrThrow(current.get(feedAtom)).items).toEqual(entries.slice(0, 12));
    }),
  );

  it.effect('interrupts a pending stream when the registry is disposed', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const finished = yield* Deferred.make<void>();
      readPage.mockImplementation(() =>
        Stream.fromEffect(
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(finished, undefined)),
          ),
        ),
      );
      const current = yield* registry;
      yield* AtomRegistry.mount(current, feedAtom);
      current.set(feedAtom, undefined);
      yield* Deferred.await(started);
      expect(current.get(feedAtom).waiting).toBe(true);
      current.dispose();
      yield* Deferred.await(finished);
    }),
  );

  it.effect('retries a failed stream from its last received item without duplicates', () =>
    Effect.gen(function* () {
      readPage.mockImplementation(() =>
        Stream.make(entries[6]!).pipe(Stream.concat(Stream.die('connection closed'))),
      );
      const current = yield* registry;
      yield* AtomRegistry.mount(current, feedAtom);
      current.set(feedAtom, undefined);
      yield* AtomRegistry.getResult(current, feedAtom, { suspendOnWaiting: true }).pipe(
        Effect.exit,
      );
      expect(AsyncResult.isFailure(current.get(feedAtom))).toBe(true);
      expect(AsyncResult.getOrElse(current.get(feedAtom), () => ({ items: [] })).items).toEqual(
        entries.slice(0, 7),
      );
      readPage.mockClear();
      readPage.mockImplementation(({ after }) =>
        Stream.fromIterable(entries.slice(after, after + PageSize)),
      );
      current.set(feedAtom, undefined);
      const result = yield* AtomRegistry.getResult(current, feedAtom, { suspendOnWaiting: true });
      expect(readPage.mock.calls).toEqual([[{ after: 7 }]]);
      expect(result.items).toEqual(entries.slice(0, 13));
      expect(current.get(feedAtom).waiting).toBe(false);
    }),
  );

  it.effect(
    'interrupts a retained stream and continues from its received cards on the next request',
    () =>
      Effect.gen(function* () {
        const finished = yield* Deferred.make<void>();
        readPage.mockImplementation(() =>
          Stream.make(entries[6]!).pipe(
            Stream.concat(Stream.fromEffect(Effect.never)),
            Stream.ensuring(Deferred.succeed(finished, undefined)),
          ),
        );
        const current = yield* registry;
        yield* AtomRegistry.mount(current, feedAtom);
        current.set(feedAtom, undefined);
        expect(AsyncResult.getOrThrow(current.get(feedAtom)).items).toEqual(entries.slice(0, 7));
        current.set(feedAtom, Atom.Interrupt);
        yield* Deferred.await(finished);
        const interrupted = current.get(feedAtom);
        expect(
          AsyncResult.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause),
        ).toBe(true);
        expect(AsyncResult.getOrElse(interrupted, () => ({ items: [] })).items).toEqual(
          entries.slice(0, 7),
        );
        expect(interrupted.waiting).toBe(false);
        readPage.mockClear();
        readPage.mockImplementation(({ after }) =>
          Stream.fromIterable(entries.slice(after, after + PageSize)),
        );
        current.set(feedAtom, undefined);
        const result = yield* AtomRegistry.getResult(current, feedAtom, { suspendOnWaiting: true });
        expect(readPage.mock.calls).toEqual([[{ after: 7 }]]);
        expect(result.items).toEqual(entries.slice(0, 13));
      }),
  );
});
