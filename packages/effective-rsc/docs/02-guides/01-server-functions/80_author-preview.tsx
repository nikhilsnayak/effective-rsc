/**
 * @title Reading a Server Function from the browser
 *
 * `queryAtom` exposes the author lookup as atom state, with typed results and `ServerFnError` failures.
 */
'use client';

import { useAtom } from '@effect/atom-react';
import { Cause, Option } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { ServerFn, type ServerFnError } from 'effective-rsc/client';

import { lookupAuthor } from './70_lookup-author';

const authorQuery = ServerFn.queryAtom(lookupAuthor);

const describe = (cause: Cause.Cause<ServerFnError>) => {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause));
  switch (error?._tag) {
    case 'ServerFnInputError':
      return `The lookup was rejected: ${error.detail.message}`;
    case 'ServerFnTransportError':
      return 'The lookup request could not complete.';
    case 'ServerFnDefect':
      return `The lookup failed. Reference ${error.digest}.`;
    default:
      return 'The lookup failed.';
  }
};

export function AuthorPreview({ authorId }: { readonly authorId: string }) {
  const [author, lookup] = useAtom(authorQuery);

  return (
    <div>
      <button onClick={() => lookup([{ authorId }])} type='button'>
        Preview author
      </button>
      <p>
        {AsyncResult.match(author, {
          onInitial: () => 'No author previewed yet.',
          onSuccess: ({ value }) =>
            value._tag === 'Found' ? value.name : `Unavailable. Retry in ${value.retryAfter}s.`,
          onFailure: ({ cause }) => describe(cause),
        })}
      </p>
    </div>
  );
}
