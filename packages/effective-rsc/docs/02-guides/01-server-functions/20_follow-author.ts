/**
 * @title Defining a Server Function
 *
 * ERSC decodes FormData before running the Effect handler.
 */
'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from './10_ersc';

export const followAuthor = ERSC.ServerFn.make({
  input: Schema.fromFormData(Schema.Struct({ authorId: Schema.NonEmptyString })),
  handler: ({ authorId }) => Effect.logInfo('Followed author', { authorId }),
});
