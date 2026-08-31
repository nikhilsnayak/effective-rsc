import * as BrowserSocket from '@effect/platform-browser/BrowserSocket';
import { Effect, Ref, Schedule, Schema, Semaphore } from 'effect';
import * as Socket from 'effect/unstable/socket/Socket';

import { makeBrowserRefresh } from './browser-refresh';
import { DevChannelMessageJson, DevChannelPath, type DevChannelMessage } from './channel';
import { decideHotUpdate, type HotUpdateCheck, type PendingDevUpdate } from './hmr-update';
import { makeDevPanel } from './panel';

const reload = Effect.sync(() => location.reload());

type DevUpdate = Exclude<DevChannelMessage, { readonly _tag: 'BuildFailed' }>;

const recordUpdate = (pending: PendingDevUpdate, message: DevUpdate): PendingDevUpdate => ({
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

const runDevClient = Effect.fnUntraced(function* (panel: Effect.Success<typeof makeDevPanel>) {
  const pendingUpdate = yield* Ref.make<PendingDevUpdate>({
    acknowledgedClientHash: import.meta.rspackHash,
    clientHash: import.meta.rspackHash,
    rscRefresh: 'Current',
  });
  const updateLock = yield* Semaphore.make(1);
  const socket = yield* Socket.Socket;
  const decode = Schema.decodeUnknownEffect(DevChannelMessageJson);
  const refreshCurrentRoute = yield* makeBrowserRefresh;
  const handleMessage = Effect.fnUntraced(function* (data: string) {
    const message = yield* decode(data);
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

  yield* socket.runString(handleMessage);
});

export const startDevClient = Effect.gen(function* () {
  const panel = yield* makeDevPanel;
  const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${socketProtocol}//${location.host}${DevChannelPath}`;

  yield* runDevClient(panel).pipe(
    Effect.provide(BrowserSocket.layerWebSocket(socketUrl)),
    Effect.retry(Schedule.exponential('1 second')),
  );
});
