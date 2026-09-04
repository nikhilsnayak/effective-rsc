import { Effect, MutableRef, Schema } from 'effect';
import { addTransitionType, startTransition } from 'react';
import {
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';

import { BrowserEffectRunner } from './browser-effect-runner';
import { BrowserRenderer } from './browser-renderer';
import { FlightClient } from './flight-client';
import { NavigationApi } from './navigation-api';
import { RouteLoader } from './route-loader';
import { RouteRefresher } from './route-refresh';

class ServerFnCallError extends Schema.TaggedError<ServerFnCallError>()('ServerFnCallError', {
  cause: Schema.Defect(),
  message: Schema.String,
}) {}

type ServerFnInvocation =
  | {
      readonly _tag: 'HistoryEntry';
      readonly id: string;
      readonly order: number;
      readonly url: string;
    }
  | { readonly _tag: 'CurrentUrl'; readonly order: number; readonly url: string };

type ServerFnRefreshSource = 'Response' | 'CurrentRoute';

export const installCallServer = Effect.gen(function* () {
  const browserRenderer = yield* BrowserRenderer;
  const navigationApi = yield* NavigationApi;
  const run = yield* BrowserEffectRunner;
  const flightClient = yield* FlightClient;
  const routeLoader = yield* RouteLoader;
  const routeRefresher = yield* RouteRefresher;
  const latestInvocationOrder = MutableRef.make(0);
  const selectRefreshSource = (invocation: ServerFnInvocation): ServerFnRefreshSource => {
    if (
      MutableRef.get(latestInvocationOrder) !== invocation.order ||
      navigationApi.getTransition() !== null
    ) {
      return 'CurrentRoute';
    }

    const currentEntry = navigationApi.getCurrentEntry();
    switch (invocation._tag) {
      case 'HistoryEntry':
        return currentEntry?.id === invocation.id ? 'Response' : 'CurrentRoute';
      case 'CurrentUrl':
        return currentEntry === null && navigationApi.getCurrentUrl() === invocation.url
          ? 'Response'
          : 'CurrentRoute';
    }
  };
  const callServer = Effect.fnUntraced(function* (
    id: string,
    args: ReadonlyArray<unknown>,
    invocationResult: PromiseWithResolvers<unknown>,
  ) {
    const currentEntry = navigationApi.getCurrentEntry();
    const order = MutableRef.incrementAndGet(latestInvocationOrder);
    const invocation: ServerFnInvocation =
      currentEntry === null
        ? { _tag: 'CurrentUrl', order, url: navigationApi.getCurrentUrl() }
        : {
            _tag: 'HistoryEntry',
            id: currentEntry.id,
            order,
            url: currentEntry.url ?? navigationApi.getCurrentUrl(),
          };
    const temporaryReferences = createTemporaryReferenceSet();
    const body = yield* Effect.tryPromise({
      try: () => encodeReply(args, { temporaryReferences }),
      catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to encode arguments.' }),
    });
    const resource = yield* flightClient
      .load({
        _tag: 'ServerFunction',
        body,
        destination: new URL(invocation.url),
        id,
        temporaryReferences,
      })
      .pipe(
        Effect.mapError(
          (cause) => new ServerFnCallError({ cause, message: 'Server Function request failed.' }),
        ),
      );
    if (resource._tag === 'Document') {
      yield* resource.release;
      return yield* new ServerFnCallError({
        cause: new Error('A Server Function response cannot request document navigation.'),
        message: 'Server Function response was incompatible with Flight.',
      });
    }
    const serverFnResult = resource.payload.serverFnResult;
    if (serverFnResult === null) {
      yield* resource.release;
      return yield* new ServerFnCallError({
        cause: new Error('The Flight payload omitted the Server Function return value.'),
        message: 'Server Function response was incomplete.',
      });
    }
    switch (serverFnResult._tag) {
      case 'Failure':
        invocationResult.reject(
          new ServerFnCallError({
            cause: serverFnResult.error,
            message: 'Server Function execution failed.',
          }),
        );
        break;
      case 'Success':
        invocationResult.resolve(serverFnResult.value);
        break;
    }
    // React registered its Action reactions before the request completed. Registering ERSC's
    // continuation after settlement lets React close that Action before the refresh Transition.
    yield* Effect.promise(() =>
      invocationResult.promise.then(
        () => undefined,
        () => undefined,
      ),
    );
    if (selectRefreshSource(invocation) === 'CurrentRoute') {
      yield* resource.release;
      yield* routeRefresher.refreshCurrentRoute('server-function');
      return;
    }

    yield* routeRefresher.interruptCurrentRouteRefresh;
    const commitRefresh = routeLoader.prepareRefresh(resource.payload.routeTree);
    let renderCommitted!: Promise<void>;
    yield* Effect.sync(() => {
      startTransition(() => {
        addTransitionType('server-function');
        // Do not return the commit Promise from React's Transition Action. React cannot commit the
        // render until that Action ends.
        renderCommitted = browserRenderer.refresh(resource.payload.routeTree);
      });
    });
    yield* Effect.all([resource.completed, Effect.promise(() => renderCommitted)], {
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
      const invocationResult = Promise.withResolvers<unknown>();
      void run(callServer(id, args, invocationResult)).catch(invocationResult.reject);
      return invocationResult.promise;
    });
  });
});
