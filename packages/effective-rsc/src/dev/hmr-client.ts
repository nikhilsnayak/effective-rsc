import * as BrowserSocket from '@effect/platform-browser/BrowserSocket';
import { Effect, Option, Ref, Schedule, Schema, Semaphore } from 'effect';
import * as Socket from 'effect/unstable/socket/Socket';

import { BrowserNavigation } from '../client/browser-navigation';
import type { NavigationResources } from '../client/navigation-resource';
import { type DevHmrMessage, DevHmrMessageJson, DevHmrPath } from './hmr';

const DevRefreshInfo = 'ersc-dev-refresh';
const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socketUrl = `${socketProtocol}//${location.host}${DevHmrPath}`;

const reload = Effect.sync(() => location.reload());
const navigationFinished = (result: NavigationResult) => result.finished ?? Promise.resolve();

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

export const startDevHmr = Effect.fnUntraced(function* (navigationResources: NavigationResources) {
  return yield* Effect.gen(function* () {
    const browserNavigation = yield* BrowserNavigation;
    const pendingUpdate = yield* Ref.make<PendingDevUpdate>({
      clientHash: import.meta.rspackHash,
      rscRefresh: 'Current',
    });
    const updateLock = yield* Semaphore.make(1);
    const socket = yield* Socket.Socket;
    const decode = Schema.decodeUnknownEffect(DevHmrMessageJson);

    const applyPendingUpdate = Effect.gen(function* () {
      const action = yield* settlePendingUpdate(pendingUpdate);
      if (action !== 'Refresh') {
        return Option.none<Promise<NavigationHistoryEntry | void>>();
      }
      navigationResources.invalidate();
      const currentEntry = browserNavigation.navigation.currentEntry;
      const navigation = browserNavigation.navigation.navigate(browserNavigation.location.href, {
        history: 'replace',
        info: DevRefreshInfo,
        state: currentEntry?.getState(),
      });
      return Option.some(navigationFinished(navigation));
    });

    const handleMessage = Effect.fnUntraced(function* (data: string) {
      const message = yield* decode(data);
      yield* Ref.update(pendingUpdate, (pending) => recordUpdate(pending, message));
      const navigation = yield* updateLock.withPermit(applyPendingUpdate);
      if (Option.isSome(navigation)) {
        yield* Effect.tryPromise(() => navigation.value).pipe(Effect.ignore);
      }
    });

    yield* socket.runString(handleMessage);
  }).pipe(
    Effect.provide(BrowserSocket.layerWebSocket(socketUrl)),
    Effect.retry(Schedule.exponential('1 second')),
  );
});
