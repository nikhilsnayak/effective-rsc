import * as BrowserSocket from '@effect/platform-browser/BrowserSocket';
import { Effect, Layer, Ref, Semaphore, Stream } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';

import { BrowserRenderStatus } from '../client/browser-render-status';
import { RouteRefresher } from '../client/route-refresh';
import { DevChannelPath, DevRpcs, type DevUpdate } from './channel';
import { decideHotUpdate, type HotUpdateCheck, type PendingDevUpdate } from './hmr-update';
import { makeDevPanel } from './panel';
import { fromRenderError, reportBrowserFailures } from './runtime-failure';

const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socketUrl = `${socketProtocol}//${location.host}${DevChannelPath}`;

const DevRpcProtocolLayer = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
  Layer.provide(BrowserSocket.layerWebSocket(socketUrl)),
  Layer.provide(RpcSerialization.layerJson),
);

type DevHotUpdate = Exclude<DevUpdate, { readonly _tag: 'BuildFailed' }>;
type DevUpdatePhase = 'Snapshot' | 'Live';

const recordUpdate = (pending: PendingDevUpdate, message: DevHotUpdate): PendingDevUpdate => ({
  acknowledgedClientHash: pending.acknowledgedClientHash,
  clientHash: message.clientHash,
  rscRefresh:
    pending.rscRefresh === 'Pending' || message._tag === 'RscUpdate' ? 'Pending' : 'Current',
});

const settlePendingUpdate = Effect.fnUntraced(function* (pendingUpdate: Ref.Ref<PendingDevUpdate>) {
  const reconcile = Effect.gen(function* () {
    const pending = yield* Ref.get(pendingUpdate);
    if (pending.acknowledgedClientHash !== pending.clientHash) {
      const previousHash = import.meta.rspackHash;
      const check = yield* Effect.tryPromise(() => import.meta.webpackHot!.check(true)).pipe(
        Effect.match({
          onFailure: (): HotUpdateCheck => ({ _tag: 'Failed' }),
          onSuccess: (updatedModules): HotUpdateCheck => ({
            _tag: 'Completed',
            currentHash: import.meta.rspackHash,
            previousHash,
            updatedModules,
          }),
        }),
      );
      const decision = decideHotUpdate(pending, check);
      if (decision._tag === 'Reload') {
        yield* Effect.sync(() => location.reload());
        return 'Reloading' as const;
      }

      yield* Ref.update(pendingUpdate, (current) => ({
        ...current,
        acknowledgedClientHash: decision.acknowledgedClientHash,
      }));
      return 'Retry' as const;
    }

    return yield* Ref.modify(pendingUpdate, (current) => {
      if (current.acknowledgedClientHash !== current.clientHash) {
        return ['Retry', current] as const;
      }
      if (current.rscRefresh === 'Current') {
        return ['Current', current] as const;
      }
      return ['Refresh', { ...current, rscRefresh: 'Current' }] as const;
    });
  });

  return yield* reconcile.pipe(Effect.repeat({ while: (action) => action === 'Retry' }));
});

export const startDevClient = Effect.gen(function* () {
  const routeRefresher = yield* RouteRefresher;
  const renderStatus = yield* BrowserRenderStatus;
  const panel = yield* makeDevPanel;
  const pendingUpdate = yield* Ref.make<PendingDevUpdate>({
    acknowledgedClientHash: import.meta.rspackHash,
    clientHash: import.meta.rspackHash,
    rscRefresh: 'Current',
  });
  const updateLock = yield* Semaphore.make(1);
  const handleHotUpdate = Effect.fnUntraced(function* (message: DevHotUpdate) {
    yield* Ref.update(pendingUpdate, (pending) => recordUpdate(pending, message));
    const action = yield* updateLock.withPermit(settlePendingUpdate(pendingUpdate));
    if (action === 'Reloading') {
      return;
    }
    const status = yield* renderStatus.get;
    if (action === 'Refresh' || status._tag === 'Failed') {
      yield* routeRefresher.refreshCurrentRoute('hmr-refresh');
      // Starting a refresh is not evidence that the replacement rendered successfully.
      return;
    }
    yield* panel.dispatch({ _tag: 'RuntimeReconciled' });
  });
  yield* renderStatus.changes.pipe(
    Stream.runForEach((status) => {
      switch (status._tag) {
        case 'Waiting':
          return Effect.void;
        case 'Rendered':
          return panel.dispatch({ _tag: 'RuntimeReconciled' });
        case 'Failed':
          return panel.dispatch({
            _tag: 'RenderFailed',
            failure: fromRenderError(status.error, status.componentStack),
          });
      }
    }),
    Effect.forkScoped,
  );
  yield* reportBrowserFailures((failure) =>
    panel.dispatch({ _tag: 'RuntimeFailed', failure }),
  ).pipe(Effect.forkScoped);

  const observeUpdates = Effect.gen(function* () {
    const client = yield* RpcClient.make(DevRpcs);
    const handleUpdate = Effect.fnUntraced(function* (phase: DevUpdatePhase, message: DevUpdate) {
      if (message._tag === 'BuildFailed') {
        yield* panel.dispatch(message);
      } else {
        yield* panel.dispatch({ _tag: 'BuildSucceeded' });
        if (phase === 'Live' || message.clientHash !== import.meta.rspackHash) {
          yield* handleHotUpdate(message);
        }
      }

      return 'Live' as const;
    });

    yield* client.ObserveDevUpdates().pipe(
      Stream.runFoldEffect((): DevUpdatePhase => 'Snapshot', handleUpdate),
      Effect.asVoid,
    );
  });

  yield* observeUpdates.pipe(Effect.provide(DevRpcProtocolLayer));
});
