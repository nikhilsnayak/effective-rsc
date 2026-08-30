import * as BrowserSocket from '@effect/platform-browser/BrowserSocket';
import { Effect, Ref, Schedule, Schema, Semaphore } from 'effect';
import * as Socket from 'effect/unstable/socket/Socket';

import { makeBrowserRefresh } from './browser-refresh';
import { type DevHmrMessage, DevHmrMessageJson, DevHmrPath } from './hmr';
import { decideHotUpdate, type HotUpdateCheck, type PendingDevUpdate } from './hmr-update';

const reload = Effect.sync(() => location.reload());

const recordUpdate = (pending: PendingDevUpdate, message: DevHmrMessage): PendingDevUpdate => ({
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

const runDevHmr = Effect.gen(function* () {
  const pendingUpdate = yield* Ref.make<PendingDevUpdate>({
    acknowledgedClientHash: import.meta.rspackHash,
    clientHash: import.meta.rspackHash,
    rscRefresh: 'Current',
  });
  const updateLock = yield* Semaphore.make(1);
  const socket = yield* Socket.Socket;
  const decode = Schema.decodeUnknownEffect(DevHmrMessageJson);
  const refreshCurrentRoute = yield* makeBrowserRefresh;

  const handleMessage = Effect.fnUntraced(function* (data: string) {
    const message = yield* decode(data);
    yield* Ref.update(pendingUpdate, (pending) => recordUpdate(pending, message));
    const action = yield* updateLock.withPermit(settlePendingUpdate(pendingUpdate));
    if (action === 'Refresh') {
      yield* refreshCurrentRoute;
    }
  });

  yield* socket.runString(handleMessage);
});

export const startDevHmr = Effect.gen(function* () {
  const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${socketProtocol}//${location.host}${DevHmrPath}`;

  yield* runDevHmr.pipe(Effect.provide(BrowserSocket.layerWebSocket(socketUrl)));
}).pipe(Effect.retry(Schedule.exponential('1 second')));
