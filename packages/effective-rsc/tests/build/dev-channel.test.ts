import { expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Stream } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';

import { makeDevChannel } from '../../src/build/dev-channel';
import type { DevUpdate } from '../../src/dev/channel';

const ClientUpdate: DevUpdate = { _tag: 'ClientUpdate', clientHash: 'client-one' };
const RscUpdate: DevUpdate = { _tag: 'RscUpdate', clientHash: 'client-two' };
const BuildFailed: DevUpdate = {
  _tag: 'BuildFailed',
  diagnostics: 'Module build failed',
};

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
  }).pipe(Effect.scoped),
);

it.effect('rejects development channel requests without a matching Origin', () =>
  Effect.gen(function* () {
    const channel = yield* makeDevChannel;
    const call = (request: Request) =>
      channel.httpEffect.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(request),
        ),
      );

    const missingOrigin = yield* call(new Request('http://localhost/_ersc/dev'));
    const crossOrigin = yield* call(
      new Request('http://localhost/_ersc/dev', {
        headers: { origin: 'https://example.com' },
      }),
    );

    expect(missingOrigin.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
  }).pipe(Effect.scoped),
);
