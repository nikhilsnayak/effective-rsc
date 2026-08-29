import { Effect, Schema, Stream, SubscriptionRef } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { type DevHmrMessage, DevHmrMessageJson } from '../dev/hmr';

type DevHmrState = { readonly _tag: 'Initial' } | DevHmrMessage;

export const makeDevHmr = Effect.gen(function* () {
  const state = yield* SubscriptionRef.make<DevHmrState>({ _tag: 'Initial' });
  const encode = Schema.encodeEffect(DevHmrMessageJson);
  const updates = SubscriptionRef.changes(state).pipe(
    Stream.filter((update): update is DevHmrMessage => update._tag !== 'Initial'),
  );
  const publish = (message: DevHmrMessage) => SubscriptionRef.set(state, message);
  const httpEffect = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const socket = yield* request.upgrade;
    const write = yield* socket.writer;

    yield* Effect.raceFirst(
      socket.runRaw(() => undefined),
      updates.pipe(
        Stream.mapEffect((message) => encode(message)),
        Stream.runForEach(write),
      ),
    );

    return HttpServerResponse.empty();
  });

  return { httpEffect, publish, updates };
});
