import { Effect, Schema } from 'effect';
import {
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';

import { BrowserNavigation } from './browser-navigation';
import type { BrowserRootController } from './browser-renderer';
import { ClientRuntime } from './client-runtime';
import { loadFlight } from './flight-loader';
import type { NavigationResources } from './navigation-resource';

class ServerFnCallError extends Schema.TaggedError<ServerFnCallError>()('ServerFnCallError', {
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

export const installCallServer = Effect.fnUntraced(function* (
  browserRoot: BrowserRootController,
  navigationResources: NavigationResources,
) {
  const { location } = yield* BrowserNavigation;
  const run = yield* ClientRuntime;
  const callServer = Effect.fnUntraced(function* (id: string, args: ReadonlyArray<unknown>) {
    const temporaryReferences = createTemporaryReferenceSet();
    const body = yield* Effect.tryPromise({
      try: () => encodeReply(args, { temporaryReferences }),
      catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to encode arguments.' }),
    });
    const resource = yield* loadFlight({
      _tag: 'ServerFunction',
      body,
      destination: new URL(location.href),
      id,
      temporaryReferences,
    }).pipe(
      Effect.mapError(
        (cause) => new ServerFnCallError({ cause, message: 'Server Function request failed.' }),
      ),
    );
    if (resource._tag === 'Document') {
      return yield* new ServerFnCallError({
        cause: new Error('A Server Function response cannot request document navigation.'),
        message: 'Server Function response was incompatible with Flight.',
      });
    }
    const commitRefresh = navigationResources.prepareRefresh(resource.payload.routeTree);
    const committed = browserRoot.refresh(resource.payload.routeTree);
    yield* Effect.all([resource.completed, Effect.promise(() => committed)], {
      concurrency: 'unbounded',
      discard: true,
    }).pipe(
      Effect.andThen(Effect.sync(commitRefresh)),
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
