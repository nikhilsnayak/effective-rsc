import { Deferred, Effect, Exit, MutableRef, Schema } from 'effect';
import { addTransitionType, startTransition } from 'react';
import {
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';

import { FrameworkQueryPath } from '../../application/namespace';
import type { ServerFnResponseModel } from '../../rsc/flight';
import { ServerFnDefect, ServerFnInputError } from '../../rsc/server-fn-error';
import { BrowserEffectRunner } from '../browser-effect-runner';
import { BrowserRenderer } from '../browser-renderer';
import { FlightClient } from '../flight-client';
import { NavigationApi } from '../navigation-api';
import { RouteLoader } from '../route-loader';
import { RouteRefresher } from '../route-refresh';
import { invocationError, matchServerFnQuery } from './protocol';

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

  const loadServerFn = Effect.fnUntraced(function* <Tag extends 'Mutation' | 'Query'>(
    tag: Tag,
    id: string,
    args: ReadonlyArray<unknown>,
    destination: URL,
  ) {
    const temporaryReferences = createTemporaryReferenceSet();
    const body = yield* Effect.tryPromise({
      try: () => encodeReply(args, { temporaryReferences }),
      catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to encode arguments.' }),
    });
    const resource = yield* flightClient
      .load({ _tag: tag, body, destination, id, temporaryReferences })
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

    return resource;
  });

  const settleInvocation = (
    invocationResult: PromiseWithResolvers<unknown>,
    response: ServerFnResponseModel,
  ) => {
    switch (response._tag) {
      case 'Failure':
        invocationResult.reject(
          response.error._tag === 'ServerFnInputError'
            ? new ServerFnInputError({ detail: response.error.detail })
            : new ServerFnDefect({
                detail: response.error.detail,
                digest: response.error.digest,
              }),
        );
        return;
      case 'Success':
        invocationResult.resolve(response.value);
        return;
    }
  };

  const callMutation = Effect.fnUntraced(function* (
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
    const resource = yield* loadServerFn('Mutation', id, args, new URL(invocation.url));
    const serverFnResponse = resource.model.serverFnResponse;
    if (serverFnResponse === null) {
      yield* resource.release;
      return yield* new ServerFnCallError({
        cause: new Error('The Flight model omitted the Server Function return value.'),
        message: 'Server Function response was incomplete.',
      });
    }
    settleInvocation(invocationResult, serverFnResponse);
    // React registered its Action reactions before the request completed. Registering ERSC's
    // continuation after settlement lets React close that Action before the refresh Transition.
    yield* Effect.promise(() =>
      invocationResult.promise.then(
        () => undefined,
        () => undefined,
      ),
    );
    let refreshSource = selectRefreshSource(invocation);
    if (refreshSource === 'Response') {
      yield* routeRefresher.interruptCurrentRouteRefresh;
      // Interruption awaits cleanup, during which navigation or another invocation can win.
      refreshSource = selectRefreshSource(invocation);
    }

    if (refreshSource === 'CurrentRoute') {
      yield* resource.release;
      yield* routeRefresher.refreshCurrentRoute('server-function');
      return;
    }
    const commitRefresh = routeLoader.prepareRefresh(resource.model.routeTree);
    let published!: ReturnType<BrowserRenderer['Service']['refresh']>;
    yield* Effect.sync(() => {
      startTransition(() => {
        addTransitionType('server-function');
        // Do not return the commit Promise from React's Transition Action. React cannot commit the
        // render until that Action ends.
        published = browserRenderer.refresh(resource.model.routeTree);
      });
    });
    yield* Effect.raceFirst(
      Effect.all([resource.completed, Effect.promise(() => published.committed)], {
        concurrency: 'unbounded',
        discard: true,
      }).pipe(Effect.andThen(Effect.sync(commitRefresh))),
      Effect.promise(() => published.retired),
    ).pipe(Effect.ensuring(resource.release), Effect.forkScoped({ startImmediately: true }));
  });

  const callQuery = Effect.fnUntraced(function* (
    id: string,
    args: ReadonlyArray<unknown>,
    invocationResult: PromiseWithResolvers<unknown>,
  ) {
    const destination = new URL(FrameworkQueryPath, navigationApi.getCurrentUrl());
    const resource = yield* loadServerFn('Query', id, args, destination);
    settleInvocation(invocationResult, resource.model);
    yield* resource.completed.pipe(Effect.ensuring(resource.release));
  });

  yield* Effect.sync(() => {
    setServerCallback((id, args) => {
      const invocationResult = Promise.withResolvers<unknown>();
      const query = matchServerFnQuery(args);
      let effect =
        query !== null
          ? callQuery(id, query.args, invocationResult)
          : callMutation(id, args, invocationResult);
      if (query?._tag === 'Stream') {
        const completed = query.completed;
        effect = effect.pipe(
          Effect.onExit((exit) => Deferred.done(completed, Exit.mapError(exit, invocationError))),
        );
      }
      const options = query !== null ? { signal: query.signal } : undefined;

      void run(effect, options).catch((cause) => invocationResult.reject(invocationError(cause)));

      return invocationResult.promise;
    });
  });
});
