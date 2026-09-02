import * as BrowserSocket from '@effect/platform-browser/BrowserSocket';
import { Effect, Layer, Ref, Semaphore, Stream } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';

import type { BrowserRenderer } from '../client/browser-renderer';
import type { NavigationResources } from '../client/navigation-resource';
import { makeRouteRefresh } from '../client/route-refresh';
import { DevChannelPath, DevRpcs, type DevUpdate } from './channel';
import { decideHotUpdate, type HotUpdateCheck, type PendingDevUpdate } from './hmr-update';
import { makeDevPanel } from './panel';
import { reportBrowserFailures } from './runtime-failure';

const reload = Effect.sync(() => location.reload());

type DevHotUpdate = Exclude<DevUpdate, { readonly _tag: 'BuildFailed' }>;

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
        yield* reload;
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

const runDevClient = Effect.fnUntraced(function* (
  panel: Effect.Success<typeof makeDevPanel>,
  refreshCurrentRoute: Effect.Effect<void>,
) {
  const pendingUpdate = yield* Ref.make<PendingDevUpdate>({
    acknowledgedClientHash: import.meta.rspackHash,
    clientHash: import.meta.rspackHash,
    rscRefresh: 'Current',
  });
  const updateLock = yield* Semaphore.make(1);
  const client = yield* RpcClient.make(DevRpcs);
  const handleUpdate = Effect.fnUntraced(function* (message: DevUpdate) {
    if (message._tag === 'BuildFailed') {
      yield* panel.dispatch(message);
      return;
    }

    yield* Ref.update(pendingUpdate, (pending) => recordUpdate(pending, message));
    const action = yield* updateLock.withPermit(settlePendingUpdate(pendingUpdate));
    if (action === 'Reloading') {
      return;
    }
    if (action === 'Refresh') {
      yield* refreshCurrentRoute;
    }
    yield* panel.dispatch({ _tag: 'Reconciled' });
  });

  yield* client.ObserveDevUpdates().pipe(Stream.runForEach(handleUpdate));
});

export const startDevClient = Effect.fnUntraced(function* (
  browserRenderer: BrowserRenderer,
  navigationResources: NavigationResources,
) {
  const panel = yield* makeDevPanel;
  const { refreshCurrentRoute } = yield* makeRouteRefresh(browserRenderer, navigationResources);
  yield* reportBrowserFailures((failure) =>
    panel.dispatch({ _tag: 'RuntimeFailed', failure }),
  ).pipe(Effect.forkScoped);
  const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${socketProtocol}//${location.host}${DevChannelPath}`;

  const ProtocolLayer = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
    Layer.provide(BrowserSocket.layerWebSocket(socketUrl)),
    Layer.provide(RpcSerialization.layerJson),
  );

  yield* runDevClient(panel, refreshCurrentRoute).pipe(Effect.provide(ProtocolLayer));
});
