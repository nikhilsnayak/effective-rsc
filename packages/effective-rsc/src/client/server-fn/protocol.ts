import { Deferred, Effect, Predicate, Schema, Stream } from 'effect';

import {
  ServerFnDefect,
  type ServerFnError,
  serverFnErrorDetail,
  ServerFnFailure,
  ServerFnTransportError,
} from '../../rsc/server-fn-error';

const isServerFnError = Schema.is(Schema.Union([ServerFnFailure, ServerFnTransportError]));

const ServerFnQueryTypeId: unique symbol = Symbol.for('ersc/ServerFnQuery');
const QueryOptions = Schema.Union([
  Schema.TaggedStruct('Query', {
    signal: Schema.instanceOf(AbortSignal),
  }),
  Schema.TaggedStruct('Stream', {
    signal: Schema.instanceOf(AbortSignal),
    completed: Schema.declare(Deferred.isDeferred<void, ServerFnError>),
  }),
]);
const isQueryOptions = Schema.is(QueryOptions);

export type MatchedQuery = typeof QueryOptions.Type & {
  readonly args: ReadonlyArray<unknown>;
};

export const matchServerFnQuery = (args: ReadonlyArray<unknown>): MatchedQuery | null => {
  const last = args.at(-1);
  try {
    if (typeof last !== 'object' || last === null || !(ServerFnQueryTypeId in last)) {
      return null;
    }

    const options = last[ServerFnQueryTypeId];
    return isQueryOptions(options) ? { ...options, args: args.slice(0, -1) } : null;
  } catch {
    // Application arguments may expose throwing getters or Proxy traps.
    return null;
  }
};

export const transportError = (cause: unknown) =>
  new ServerFnTransportError({ detail: serverFnErrorDetail(cause) });

const streamError = (cause: unknown): ServerFnError => {
  if (!Predicate.hasProperty(cause, 'digest') || typeof cause.digest !== 'string') {
    return transportError(cause);
  }

  return new ServerFnDefect({ detail: serverFnErrorDetail(cause), digest: cause.digest });
};

const invoke = <Args extends ReadonlyArray<unknown>>(
  serverFn: (...args: Args) => Promise<unknown>,
  args: Args,
  options: typeof QueryOptions.Type,
) => {
  const target = serverFn as (...args: ReadonlyArray<unknown>) => Promise<unknown>;

  return target(...args, { [ServerFnQueryTypeId]: options });
};

export const invocationError = (cause: unknown): ServerFnError =>
  isServerFnError(cause) ? cause : transportError(cause);

export const callQueryValue = <Args extends ReadonlyArray<unknown>>(
  serverFn: (...args: Args) => Promise<unknown>,
  args: Args,
) =>
  Effect.tryPromise({
    try: (signal) => invoke(serverFn, args, { _tag: 'Query', signal }),
    catch: invocationError,
  });

export const callQueryStream = Effect.fnUntraced(function* <Args extends ReadonlyArray<unknown>>(
  serverFn: (...args: Args) => Promise<unknown>,
  args: Args,
) {
  const signal = yield* Effect.abortSignal;
  const completed = yield* Deferred.make<void, ServerFnError>();

  const value = yield* Effect.tryPromise({
    try: () => invoke(serverFn, args, { _tag: 'Stream', signal, completed }),
    catch: invocationError,
  });
  return Stream.fromReadableStream({
    evaluate: () => value as ReadableStream<unknown>,
    onError: streamError,
  }).pipe(
    // The returned stream can end before Flight delivers its pending Server Components.
    Stream.onEnd(Deferred.await(completed)),
  );
});
