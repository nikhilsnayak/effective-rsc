import { type Cause, Effect, Stream } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { ServerFnError } from '../../rsc/server-fn-error';
import { callQueryStream, callQueryValue } from './protocol';

type AnyReadable = ReadableStream<unknown>;

type ServerFnTarget<Args extends ReadonlyArray<unknown>, Output> = (
  ...args: Args
) => Promise<Output>;

type StreamValue<Output> = [Output] extends [ReadableStream<infer Value>] ? Value : never;

type NotStreaming<Output> = [Extract<Output, AnyReadable>] extends [never]
  ? unknown
  : { readonly 'A streaming Server Function is read with ServerFn.stream': never };

type Streaming<Output> = [Output] extends [AnyReadable]
  ? unknown
  : { readonly 'A non-streaming Server Function is read with ServerFn.query': never };

const readValue = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: ServerFnTarget<Args, Output>,
  args: Args,
): Effect.Effect<Output, ServerFnError> => {
  return Effect.map(callQueryValue(serverFn, args), (value) => value as Output);
};

const readStream = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: ServerFnTarget<Args, Output>,
  args: Args,
): Stream.Stream<StreamValue<Output>, ServerFnError> => {
  return Stream.unwrap(callQueryStream(serverFn, args)) as Stream.Stream<
    StreamValue<Output>,
    ServerFnError
  >;
};

export const query = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: ServerFnTarget<Args, Output> & NotStreaming<Output>,
) => {
  return (...args: Args): Effect.Effect<Output, ServerFnError> => {
    return readValue(serverFn, args);
  };
};

export const queryAtom = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: ServerFnTarget<Args, Output> & NotStreaming<Output>,
): Atom.AtomResultFn<Args, Output, ServerFnError> => {
  return Atom.fn((args: Args) => readValue(serverFn, args));
};

export const stream = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: ServerFnTarget<Args, Output> & Streaming<Output>,
) => {
  return (...args: Args): Stream.Stream<StreamValue<Output>, ServerFnError> => {
    return readStream(serverFn, args);
  };
};

export const streamAtom = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: ServerFnTarget<Args, Output> & Streaming<Output>,
): Atom.AtomResultFn<Args, StreamValue<Output>, ServerFnError | Cause.NoSuchElementError> => {
  return Atom.fn((args: Args) => readStream(serverFn, args));
};
