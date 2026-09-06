import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Deferred, Effect, Runtime } from 'effect';

import { serve, type StartOptions } from './serve';

export type { StartOptions } from './serve';

export const start = (options: StartOptions): Promise<void> => {
  const ready = Deferred.makeUnsafe<void, Effect.Error<ReturnType<typeof serve>>>();

  BunRuntime.runMain(
    serve(options).pipe(
      Effect.tap(() => Deferred.succeed(ready, undefined)),
      Effect.andThen(Effect.never),
      Effect.scoped,
      Effect.onExit((exit) => Deferred.done(ready, exit)),
    ),
    {
      // Let the caller observe readiness rejection before runMain exits the process.
      teardown: (exit, onExit) => {
        setImmediate(() => Runtime.defaultTeardown(exit, onExit));
      },
    },
  );

  return Effect.runPromise(Deferred.await(ready));
};
