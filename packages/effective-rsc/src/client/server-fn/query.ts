import type { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { ServerFnError } from '../../rsc/server-fn-error';
import { callQuery } from './protocol';

export const query = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: (...args: Args) => Promise<Output>,
) => {
  return (...args: Args): Effect.Effect<Output, ServerFnError> => {
    return callQuery(serverFn, args);
  };
};

export const queryAtom = <Args extends ReadonlyArray<unknown>, Output>(
  serverFn: (...args: Args) => Promise<Output>,
): Atom.AtomResultFn<Args, Output, ServerFnError> => {
  return Atom.fn((args: Args) => {
    return callQuery(serverFn, args);
  });
};
