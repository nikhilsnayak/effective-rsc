import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Schema, Stream } from 'effect';

import { makeDevHmr } from '../../src/build/dev-hmr';
import { DevHmrMessageJson, type DevHmrMessage } from '../../src/dev/hmr';

const ClientUpdate: DevHmrMessage = { _tag: 'ClientUpdate', clientHash: 'client-one' };
const RscUpdate: DevHmrMessage = { _tag: 'RscUpdate', clientHash: 'client-two' };

it('round-trips the development HMR wire protocol through Schema', () => {
  const encode = Schema.encodeSync(DevHmrMessageJson);
  const decode = Schema.decodeSync(DevHmrMessageJson);

  expect(decode(encode(ClientUpdate))).toEqual(ClientUpdate);
  expect(decode(encode(RscUpdate))).toEqual(RscUpdate);
});

it.effect('replays the latest update and streams later updates to each subscriber', () =>
  Effect.gen(function* () {
    const hmr = yield* makeDevHmr;
    yield* hmr.publish(ClientUpdate);

    const receivedFirst = yield* Deferred.make<void>();
    const updates = yield* hmr.updates.pipe(
      Stream.tap(() => Deferred.succeed(receivedFirst, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkScoped,
    );

    yield* Deferred.await(receivedFirst);
    yield* hmr.publish(RscUpdate);

    expect(Array.from(yield* Fiber.join(updates))).toEqual([ClientUpdate, RscUpdate]);
  }),
);
