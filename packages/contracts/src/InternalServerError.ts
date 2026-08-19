import { Schema } from 'effect';

export class InternalServerError extends Schema.TaggedError<InternalServerError>()(
  'InternalServerError',
  {},
) {}
