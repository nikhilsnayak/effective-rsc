import { Effect, MutableRef, Schema, Stream, SubscriptionRef } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { type DevChannelMessage, DevChannelMessageJson } from '../dev/channel';

type DevChannelState = { readonly _tag: 'Initial' } | DevChannelMessage;
type PendingDevUpdate = { readonly _tag: 'ClientUpdate' } | { readonly _tag: 'RscUpdate' };

export const makeDevChannel = Effect.gen(function* () {
  const pending = MutableRef.make<PendingDevUpdate>({ _tag: 'ClientUpdate' });
  const state = yield* SubscriptionRef.make<DevChannelState>({ _tag: 'Initial' });
  const encode = Schema.encodeEffect(DevChannelMessageJson);
  const updates = SubscriptionRef.changes(state).pipe(
    Stream.filter((update): update is DevChannelMessage => update._tag !== 'Initial'),
  );
  const onCompilationStart = () => {
    MutableRef.set(pending, { _tag: 'ClientUpdate' });
  };
  const onServerComponentChanges = () => {
    MutableRef.set(pending, { _tag: 'RscUpdate' });
  };
  const publishCompilation = (clientHash: string) =>
    SubscriptionRef.set(state, { ...MutableRef.get(pending), clientHash });
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

  return {
    httpEffect,
    onCompilationStart,
    onServerComponentChanges,
    publishCompilation,
    updates,
  };
});
