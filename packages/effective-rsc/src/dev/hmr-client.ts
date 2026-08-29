import * as BrowserSocket from '@effect/platform-browser/BrowserSocket';
import { Effect, Schedule, Schema, Semaphore } from 'effect';
import * as Socket from 'effect/unstable/socket/Socket';

import { DevHmrMessageJson, DevHmrPath } from './hmr';

const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socketUrl = `${socketProtocol}//${location.host}${DevHmrPath}`;

const reload = Effect.sync(() => location.reload());

const applyClientUpdate = Effect.fnUntraced(function* (clientHash: string) {
  const hot = import.meta.webpackHot;

  if (hot === undefined) {
    return yield* reload;
  }

  while (import.meta.rspackHash !== clientHash) {
    const updatedModules = yield* Effect.tryPromise(() => hot.check(true)).pipe(
      Effect.orElseSucceed(() => null),
    );

    if (updatedModules === null) {
      return yield* reload;
    }
  }
});

export const devHmrClient = Effect.gen(function* () {
  const updateLock = yield* Semaphore.make(1);
  const socket = yield* Socket.Socket;
  const decode = Schema.decodeUnknownEffect(DevHmrMessageJson);

  yield* socket.runString((data) =>
    updateLock.withPermit(
      decode(data).pipe(Effect.flatMap((message) => applyClientUpdate(message.clientHash))),
    ),
  );
}).pipe(
  Effect.provide(BrowserSocket.layerWebSocket(socketUrl)),
  Effect.retry(Schedule.exponential('1 second')),
);
