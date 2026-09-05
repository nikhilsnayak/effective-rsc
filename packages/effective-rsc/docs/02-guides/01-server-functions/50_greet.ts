/**
 * @title Defining a stateful form action
 *
 * A schema list decodes React's previous state and submitted FormData separately.
 */
'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from './10_ersc';

const StateSchema = Schema.Struct({ message: Schema.String });
const FormSchema = Schema.fromFormData(Schema.Struct({ name: Schema.NonEmptyString }));

export const greet = ERSC.ServerFn.make({
  input: [StateSchema, FormSchema],
  handler: (_previousState, { name }) => Effect.succeed({ message: `Hello, ${name}` }),
});
