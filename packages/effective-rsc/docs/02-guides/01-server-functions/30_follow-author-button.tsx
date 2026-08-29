/**
 * @title Rendering a Server Function form
 *
 * Receive the server-bound action as a Client Component prop.
 */
'use client';

import { useActionState } from 'react';

import type { FollowAuthorState } from './20_follow-author';

export function FollowAuthorButton({
  action,
}: {
  readonly action: () => Promise<FollowAuthorState>;
}) {
  const [state, formAction, pending] = useActionState<FollowAuthorState | null>(action, null);

  return (
    <form action={formAction}>
      <button disabled={pending} type='submit'>
        {pending ? 'Saving…' : state?.following ? 'Following' : 'Follow author'}
      </button>
      {state?.following ? <p>Following {state.authorId}</p> : null}
    </form>
  );
}
