/**
 * @title Defining a Server Function
 *
 * ERSC decodes input before running the Effect handler.
 */
'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from './10_ersc';

export type FollowAuthorState = {
  readonly authorId: string;
  readonly following: boolean;
};

export const followAuthor = ERSC.ServerFn.make({
  input: Schema.Struct({ authorId: Schema.NonEmptyString }),
  handler: ({ authorId }) =>
    Effect.succeed({ authorId, following: true } satisfies FollowAuthorState),
});
