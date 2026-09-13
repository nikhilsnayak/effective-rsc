import { Effect, Schema } from 'effect';

import {
  type ServerFnError,
  serverFnErrorDetail,
  ServerFnFailure,
  ServerFnTransportError,
} from '../../rsc/server-fn-error';

const isServerFnError = Schema.is(Schema.Union([ServerFnFailure, ServerFnTransportError]));

const ServerFnQueryTypeId: unique symbol = Symbol.for('ersc/ServerFnQuery');
const isQueryOptions = Schema.is(Schema.Struct({ signal: Schema.instanceOf(AbortSignal) }));

type ServerFnQueryTarget<Output> = (...args: ReadonlyArray<unknown>) => Promise<Output>;

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

export const invocationError = (cause: unknown): ServerFnError =>
  isServerFnError(cause) ? cause : transportError(cause);

export const callQuery = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: (...args: Args) => Promise<Output>,
  args: Args,
): Effect.Effect<Output, ServerFnError> =>
  Effect.tryPromise({
    try: (signal) =>
      (serverFn as ServerFnQueryTarget<Output>)(...args, {
        [ServerFnQueryTypeId]: { signal },
      }),
    catch: invocationError,
  });
