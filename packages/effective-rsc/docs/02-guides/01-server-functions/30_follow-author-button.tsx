/**
 * @title Calling a Server Function from a Client Component
 *
 * Bind the input before passing the client reference to React.
 */
'use client';

import { useActionState } from 'react';

import { followAuthor, type FollowAuthorState } from './20_follow-author';

export function FollowAuthorButton({ authorId }: { readonly authorId: string }) {
  const action = followAuthor.bind(null, { authorId });
  const [state, formAction, pending] = useActionState<FollowAuthorState | null>(action, null);

  return (
    <form action={formAction}>
      <button disabled={pending} type='submit'>
        {pending ? 'Saving…' : state?.following ? 'Following' : 'Follow author'}
      </button>
    </form>
  );
}
