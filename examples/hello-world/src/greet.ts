'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from './ersc';

const FormSchema = Schema.fromFormData(
  Schema.Struct({ name: Schema.NonEmptyString.check(Schema.isMaxLength(80)) }),
);

export const greet = ERSC.ServerFn.make({
  input: [Schema.String, FormSchema],
  handler: (_previousState, { name }) => Effect.succeed(`Hello, ${name}!`),
});
