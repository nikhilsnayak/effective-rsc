import { Schema } from 'effect';

export const ServerFnErrorDetail = Schema.Struct({
  message: Schema.String,
  name: Schema.String,
  stack: Schema.NullOr(Schema.String),
});
export type ServerFnErrorDetail = typeof ServerFnErrorDetail.Type;

export const serverFnErrorDetail = (value: unknown): ServerFnErrorDetail =>
  value instanceof Error
    ? { message: value.message, name: value.name, stack: value.stack ?? null }
    : { message: String(value), name: 'Error', stack: null };

export class ServerFnInputError extends Schema.TaggedError<ServerFnInputError>()(
  'ServerFnInputError',
  { detail: Schema.Struct({ message: Schema.String, name: Schema.String }) },
) {}

export class ServerFnDefect extends Schema.TaggedError<ServerFnDefect>()('ServerFnDefect', {
  detail: Schema.NullOr(ServerFnErrorDetail),
  digest: Schema.String,
}) {}

export class ServerFnTransportError extends Schema.TaggedError<ServerFnTransportError>()(
  'ServerFnTransportError',
  { detail: ServerFnErrorDetail },
) {}

export type ServerFnError = ServerFnDefect | ServerFnInputError | ServerFnTransportError;

export const ServerFnFailure = Schema.Union([ServerFnDefect, ServerFnInputError]);
export type ServerFnFailureModel = typeof ServerFnFailure.Encoded;
