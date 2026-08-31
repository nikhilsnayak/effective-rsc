/**
 * @title Consuming middleware data in a Server Function
 */
'use server';

import { Effect, Schema } from 'effect';

import { AuthenticatedERSC, CurrentUser } from './10_auth';

export const updateDisplayName = AuthenticatedERSC.ServerFn.make({
  input: Schema.Struct({ name: Schema.NonEmptyString }),
  handler: Effect.fn('updateDisplayName')(function* ({ name }) {
    const user = yield* CurrentUser;
    yield* Effect.logInfo('Updating profile', { from: user.name, to: name });
  }),
});
