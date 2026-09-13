import { Effect, Predicate, Schema, Stream } from 'effect';

import {
  ServerFnDefect,
  type ServerFnError,
  serverFnErrorDetail,
  ServerFnFailure,
  ServerFnTransportError,
} from '../../rsc/server-fn-error';

const isServerFnError = Schema.is(Schema.Union([ServerFnFailure, ServerFnTransportError]));

const ServerFnQueryTypeId: unique symbol = Symbol.for('ersc/ServerFnQuery');
const isQueryOptions = Schema.is(Schema.Struct({ signal: Schema.instanceOf(AbortSignal) }));

export type MatchedQuery = {
  readonly args: ReadonlyArray<unknown>;
  readonly signal: AbortSignal;
};

export const matchServerFnQuery = (args: ReadonlyArray<unknown>): MatchedQuery | null => {
  const last = args.at(-1);
  try {
    if (typeof last !== 'object' || last === null || !(ServerFnQueryTypeId in last)) {
      return null;
    }

    const options = last[ServerFnQueryTypeId];
    return isQueryOptions(options) ? { args: args.slice(0, -1), signal: options.signal } : null;
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
  signal: AbortSignal,
) => {
  const target = serverFn as (...args: ReadonlyArray<unknown>) => Promise<unknown>;

  return target(...args, { [ServerFnQueryTypeId]: { signal } });
};

export const invocationError = (cause: unknown): ServerFnError =>
  isServerFnError(cause) ? cause : transportError(cause);

export const callQueryValue = <Args extends ReadonlyArray<unknown>>(
  serverFn: (...args: Args) => Promise<unknown>,
  args: Args,
) =>
  Effect.tryPromise({
    try: (signal) => invoke(serverFn, args, signal),
    catch: invocationError,
  });

export const callQueryStream = Effect.fnUntraced(function* <Args extends ReadonlyArray<unknown>>(
  serverFn: (...args: Args) => Promise<unknown>,
  args: Args,
) {
  const signal = yield* Effect.abortSignal;

  return yield* Effect.tryPromise({
    try: () => invoke(serverFn, args, signal),
    catch: invocationError,
  });
});

export const readableToStream = <Value>(value: ReadableStream<Value>) =>
  Stream.fromReadableStream({ evaluate: () => value, onError: streamError });
