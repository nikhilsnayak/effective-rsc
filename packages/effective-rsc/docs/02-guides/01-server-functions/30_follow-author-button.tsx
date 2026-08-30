/**
 * @title Rendering a direct form action
 *
 * A FormData Server Function can be passed directly to form action.
 */
import { Effect } from 'effect';

import { ERSC } from './10_ersc';
import { followAuthor } from './20_follow-author';

export const FollowAuthorButton = ERSC.Component.make({
  render: ({ authorId }: { readonly authorId: string }) =>
    Effect.succeed(
      <form action={followAuthor}>
        <input name='authorId' type='hidden' value={authorId} />
        <button type='submit'>Follow author</button>
      </form>,
    ),
});
