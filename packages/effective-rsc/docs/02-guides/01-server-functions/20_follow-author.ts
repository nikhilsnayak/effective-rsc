/**
 * @title Defining a Server Function
 *
 * ERSC decodes input before running the Effect handler.
 */
'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from './01_application';

export type FollowAuthorState = {
  readonly following: boolean;
};

export const followAuthor = ERSC.ServerFn.make({
  input: Schema.Struct({ authorId: Schema.NonEmptyString }),
  handler: () => Effect.succeed({ following: true } satisfies FollowAuthorState),
});
