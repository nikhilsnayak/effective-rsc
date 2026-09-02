import { Effect, Schema } from 'effect';
import { startTransition } from 'react';
import {
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';

import { BrowserNavigation } from './browser-navigation';
import { BrowserRenderer } from './browser-renderer';
import { ClientRuntime } from './client-runtime';
import { FlightClient } from './flight-client';
import { NavigationResources } from './navigation-resource';

class ServerFnCallError extends Schema.TaggedError<ServerFnCallError>()('ServerFnCallError', {
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

export const installCallServer = Effect.gen(function* () {
  const { location } = yield* BrowserNavigation;
  const browserRenderer = yield* BrowserRenderer;
  const run = yield* ClientRuntime;
  const flightClient = yield* FlightClient;
  const navigationResources = yield* NavigationResources;
  const callServer = Effect.fnUntraced(function* (
    id: string,
    args: ReadonlyArray<unknown>,
    actionResult: PromiseWithResolvers<unknown>,
  ) {
    const temporaryReferences = createTemporaryReferenceSet();
    const body = yield* Effect.tryPromise({
      try: () => encodeReply(args, { temporaryReferences }),
      catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to encode arguments.' }),
    });
    const resource = yield* flightClient
      .load({
        _tag: 'ServerFunction',
        body,
        destination: new URL(location.href),
        id,
        temporaryReferences,
      })
      .pipe(
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
    const serverFnResult = resource.payload.serverFnResult;
    if (serverFnResult === null) {
      return yield* new ServerFnCallError({
        cause: new Error('The Flight payload omitted the Server Function return value.'),
        message: 'Server Function response was incomplete.',
      });
    }
    switch (serverFnResult._tag) {
      case 'Failure':
        actionResult.reject(
          new ServerFnCallError({
            cause: serverFnResult.error,
            message: 'Server Function execution failed.',
          }),
        );
        break;
      case 'Success':
        actionResult.resolve(serverFnResult.value);
        break;
    }
    // React registered its Action reactions before the request completed. Registering ERSC's
    // continuation after settlement lets React close that Action before the refresh Transition.
    yield* Effect.promise(() =>
      actionResult.promise.then(
        () => undefined,
        () => undefined,
      ),
    );
    const commitRefresh = navigationResources.prepareRefresh(resource.payload.routeTree);
    const committed = Promise.withResolvers<void>();
    startTransition(() => {
      // Keep the commit Promise outside React's Transition Action. Returning it would make React
      // wait for the commit that this Promise itself observes.
      browserRenderer.refresh(resource.payload.routeTree).then(committed.resolve, committed.reject);
    });
    yield* Effect.all([resource.completed, Effect.promise(() => committed.promise)], {
      concurrency: 'unbounded',
      discard: true,
    }).pipe(
      Effect.andThen(Effect.sync(commitRefresh)),
      Effect.onError(() => resource.release),
      Effect.forkScoped,
    );
  });

  yield* Effect.sync(() => {
    setServerCallback((id, args) => {
      const actionResult = Promise.withResolvers<unknown>();
      run(callServer(id, args, actionResult)).then(undefined, actionResult.reject);
      return actionResult.promise;
    });
  });
});
