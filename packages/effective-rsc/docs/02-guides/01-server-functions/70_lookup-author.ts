/**
 * @title Modelling an expected outcome
 *
 * The handler's Effect error channel is `never`, so expected outcomes belong in its success value.
 */
'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from './10_ersc';

export type AuthorLookup =
  | { readonly _tag: 'Found'; readonly name: string }
  | { readonly _tag: 'Unavailable'; readonly retryAfter: number };

export const lookupAuthor = ERSC.ServerFn.make({
  input: Schema.Struct({ authorId: Schema.NonEmptyString }),
  handler: ({ authorId }) =>
    Effect.succeed<AuthorLookup>(
      authorId === 'ada'
        ? { _tag: 'Found', name: 'Ada Lovelace' }
        : { _tag: 'Unavailable', retryAfter: 30 },
    ),
});
