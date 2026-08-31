import { Deferred, Effect, Layer, MutableRef, Stream, SubscriptionRef } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { DevRpcs, type DevUpdate } from '../dev/channel';

type DevChannelState = { readonly _tag: 'Initial' } | DevUpdate;
type PendingDevUpdate = { readonly _tag: 'ClientUpdate' } | { readonly _tag: 'RscUpdate' };

export const makeDevChannel = Effect.gen(function* () {
  const pending = MutableRef.make<PendingDevUpdate>({ _tag: 'ClientUpdate' });
  const state = yield* SubscriptionRef.make<DevChannelState>({ _tag: 'Initial' });
  const shutdownSignal = yield* Deferred.make<void>();
  const updates = SubscriptionRef.changes(state).pipe(
    Stream.filter((update): update is DevUpdate => update._tag !== 'Initial'),
  );
  const onCompilationStart = () => {
    MutableRef.set(pending, { _tag: 'ClientUpdate' });
  };
  const onServerComponentChanges = () => {
    MutableRef.set(pending, { _tag: 'RscUpdate' });
  };
  const publishCompilation = (clientHash: string) =>
    SubscriptionRef.set(state, { ...MutableRef.get(pending), clientHash });
  const publishBuildFailure = (diagnostics: string) =>
    SubscriptionRef.set(state, { _tag: 'BuildFailed', diagnostics });
  const Handlers = DevRpcs.toLayerHandler('ObserveDevUpdates', () => updates);
  const rpcHttpEffect = yield* RpcServer.toHttpEffectWebsocket(DevRpcs).pipe(
    Effect.provide(Layer.merge(Handlers, RpcSerialization.layerJson)),
  );
  const httpEffect = Effect.raceFirst(
    Deferred.await(shutdownSignal).pipe(Effect.as(HttpServerResponse.empty())),
    rpcHttpEffect,
  );

  return {
    close: Deferred.succeed(shutdownSignal, undefined).pipe(Effect.asVoid),
    httpEffect,
    onCompilationStart,
    onServerComponentChanges,
    publishBuildFailure,
    publishCompilation,
    updates,
  };
});
