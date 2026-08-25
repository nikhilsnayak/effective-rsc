import { Effect, FiberSet, Schema, Scope } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import {
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';

import type { BrowserRootController } from './browser-root';
import { loadFlight } from './flight-loader';

class ServerFnCallError extends Schema.TaggedError<ServerFnCallError>()('ServerFnCallError', {
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

export const installCallServer = Effect.fnUntraced(function* (browserRoot: BrowserRootController) {
  const run = yield* FiberSet.makeRuntimePromise<HttpClient.HttpClient | Scope.Scope>();
  const callServer = Effect.fnUntraced(function* (id: string, args: ReadonlyArray<unknown>) {
    const temporaryReferences = createTemporaryReferenceSet();
    const body = yield* Effect.tryPromise({
      try: () => encodeReply(args, { temporaryReferences }),
      catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to encode arguments.' }),
    });
    const resource = yield* loadFlight({
      _tag: 'ServerFunction',
      body,
      destination: new URL(window.location.href),
      id,
      temporaryReferences,
    }).pipe(
      Effect.mapError(
        (cause) => new ServerFnCallError({ cause, message: 'Server Function request failed.' }),
      ),
    );
    const committed = browserRoot.render({
      _tag: 'ServerFunction',
      routeTree: resource.payload.routeTree,
    });
    yield* Effect.promise(() => committed).pipe(
      Effect.onError(() => resource.release),
      Effect.forkScoped,
    );
    const serverFnResult = resource.payload.serverFnResult;
    if (serverFnResult === null) {
      return yield* new ServerFnCallError({
        cause: new Error('The Flight payload omitted the Server Function return value.'),
        message: 'Server Function response was incomplete.',
      });
    }
    switch (serverFnResult._tag) {
      case 'Failure':
        return yield* new ServerFnCallError({
          cause: serverFnResult.error,
          message: 'Server Function execution failed.',
        });
      case 'Success':
        return serverFnResult.value;
    }
  });

  yield* Effect.sync(() => {
    setServerCallback((id, args) => run(callServer(id, args)));
  });
});
