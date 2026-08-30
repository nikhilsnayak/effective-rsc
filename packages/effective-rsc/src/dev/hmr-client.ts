import * as BrowserSocket from '@effect/platform-browser/BrowserSocket';
import { Effect, Ref, Schedule, Schema, Semaphore } from 'effect';
import * as Socket from 'effect/unstable/socket/Socket';

import { makeBrowserRefresh } from './browser-refresh';
import { type DevHmrMessage, DevHmrMessageJson, DevHmrPath } from './hmr';

const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socketUrl = `${socketProtocol}//${location.host}${DevHmrPath}`;

const reload = Effect.sync(() => location.reload());
type PendingDevUpdate = {
  readonly clientHash: string;
  readonly rscRefresh: 'Current' | 'Pending';
};

const recordUpdate = (pending: PendingDevUpdate, message: DevHmrMessage): PendingDevUpdate => ({
  clientHash: message.clientHash,
  rscRefresh:
    pending.rscRefresh === 'Pending' || message._tag === 'RscUpdate' ? 'Pending' : 'Current',
});

const settlePendingUpdate = Effect.fnUntraced(function* (pendingUpdate: Ref.Ref<PendingDevUpdate>) {
  const reconcile = Effect.gen(function* () {
    const pending = yield* Ref.get(pendingUpdate);
    if (import.meta.rspackHash !== pending.clientHash) {
      const previousHash = import.meta.rspackHash;
      const updatedModules = yield* Effect.tryPromise(() =>
        import.meta.webpackHot!.check(true),
      ).pipe(Effect.orElseSucceed(() => null));
      if (updatedModules === null || import.meta.rspackHash === previousHash) {
        yield* reload;
        return 'Reloading' as const;
      }
      return 'Retry' as const;
    }

    return yield* Ref.modify(pendingUpdate, (pending) => {
      if (pending.clientHash !== import.meta.rspackHash) {
        return ['Retry', pending] as const;
      }
      if (pending.rscRefresh === 'Current') {
        return ['Current', pending] as const;
      }
      return ['Refresh', { ...pending, rscRefresh: 'Current' }] as const;
    });
  });

  return yield* reconcile.pipe(Effect.repeat({ while: (action) => action === 'Retry' }));
});

export const startDevHmr = Effect.gen(function* () {
  const pendingUpdate = yield* Ref.make<PendingDevUpdate>({
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
}).pipe(
  Effect.provide(BrowserSocket.layerWebSocket(socketUrl)),
  Effect.retry(Schedule.exponential('1 second')),
);
