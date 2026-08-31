import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Schema, Stream } from 'effect';

import { makeDevChannel } from '../../src/build/dev-channel';
import { DevChannelMessageJson, type DevChannelMessage } from '../../src/dev/channel';

const ClientUpdate: DevChannelMessage = { _tag: 'ClientUpdate', clientHash: 'client-one' };
const RscUpdate: DevChannelMessage = { _tag: 'RscUpdate', clientHash: 'client-two' };
const BuildFailed: DevChannelMessage = {
  _tag: 'BuildFailed',
  diagnostics: 'Module build failed',
};

it('round-trips the development HMR wire protocol through Schema', () => {
  const encode = Schema.encodeSync(DevChannelMessageJson);
  const decode = Schema.decodeSync(DevChannelMessageJson);

  expect(decode(encode(ClientUpdate))).toEqual(ClientUpdate);
  expect(decode(encode(RscUpdate))).toEqual(RscUpdate);
  expect(decode(encode(BuildFailed))).toEqual(BuildFailed);
});

it.effect('replays the latest update and streams later updates to each subscriber', () =>
  Effect.gen(function* () {
    const channel = yield* makeDevChannel;
    yield* channel.publishCompilation(ClientUpdate.clientHash);

    const receivedFirst = yield* Deferred.make<void>();
    const updates = yield* channel.updates.pipe(
      Stream.tap(() => Deferred.succeed(receivedFirst, undefined)),
      Stream.take(3),
      Stream.runCollect,
      Effect.forkScoped,
    );

    yield* Deferred.await(receivedFirst);
    yield* channel.publishBuildFailure(BuildFailed.diagnostics);
    channel.onCompilationStart();
    channel.onServerComponentChanges();
    yield* channel.publishCompilation(RscUpdate.clientHash);

    const received = yield* Fiber.join(updates);
    expect(Array.from(received)).toEqual([ClientUpdate, BuildFailed, RscUpdate]);
  }),
);
