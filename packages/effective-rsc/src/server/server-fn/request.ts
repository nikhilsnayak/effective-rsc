import { Effect, Schema } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/server.node';

import type { ERSCIdentity } from '../../application/ersc-identity';
import type { AnyMiddleware } from '../../application/middleware';
import { matchServerFnInvocation } from '../../application/server-fn';
import type { ServerFnInputError } from '../../rsc/server-fn-error';

const ArgumentArraySizeLimit = 10_000;
const decodeArgumentArray = Schema.decodeUnknownEffect(Schema.Array(Schema.Unknown));
const NoMiddleware = Object.freeze([]);

export class ServerFnRequestError extends Schema.TaggedError<ServerFnRequestError>()(
  'ServerFnRequestError',
  {
    cause: Schema.Defect(),
    message: Schema.String,
    status: Schema.Literals([400, 403, 500]),
  },
) {}

export const requestError = (message: string, status: 400 | 403 | 500, cause: unknown) =>
  new ServerFnRequestError({ cause, message, status });

export const validateOrigin = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.try({
    try: () => {
      const origin = request.headers['origin'];
      if (origin === undefined) {
        throw new Error('The Origin header is missing.');
      }

      const expectedHost = request.headers['host'];
      if (expectedHost === undefined || new URL(origin).host !== expectedHost.toLowerCase()) {
        throw new Error(`Origin "${origin}" does not match host "${expectedHost ?? ''}".`);
      }
    },
    catch: (cause) => requestError('Rejected a cross-origin Server Function request.', 403, cause),
  });

export const toWebRequest = Effect.fnUntraced(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const signal = yield* Effect.abortSignal;
  return yield* HttpServerRequest.toWeb(request, { signal });
});

const bodyReadError = (cause: unknown) =>
  requestError('Failed to read the Server Function request body.', 400, cause);

const readBody = Effect.fnUntraced(function* (request: Request) {
  if (request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    return yield* Effect.tryPromise({ try: () => request.formData(), catch: bodyReadError });
  }

  return yield* Effect.tryPromise({ try: () => request.text(), catch: bodyReadError });
});

export type ServerFnOperation<ApplicationServices> = {
  readonly effect: Effect.Effect<unknown, ServerFnInputError, ApplicationServices>;
  readonly middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>;
};

export const prepareServerFnOperation = <ApplicationServices>(
  identity: ERSCIdentity<ApplicationServices>,
  action: (...args: ReadonlyArray<unknown>) => unknown,
  args: ReadonlyArray<unknown>,
) =>
  Effect.try({
    try: (): ServerFnOperation<ApplicationServices> => {
      const invocation = action(...args);
      const match = matchServerFnInvocation(invocation, identity);
      switch (match._tag) {
        case 'Match':
          return { effect: match.effect, middleware: match.middleware };
        case 'IdentityMismatch':
          return {
            effect: Effect.die(
              new TypeError('Server Function was created by a different ERSC module.'),
            ),
            middleware: NoMiddleware,
          };
        case 'Native':
          return {
            effect: Effect.promise(() => Promise.resolve(invocation)),
            middleware: NoMiddleware,
          };
      }
    },
    catch: (cause) => requestError('The Server Function could not be invoked.', 500, cause),
  });

export type ServerFnCall<ApplicationServices> = {
  readonly operation: ServerFnOperation<ApplicationServices>;
  readonly temporaryReferences: TemporaryReferenceSet;
};

export const decodeServerFnCall = Effect.fnUntraced(function* <ApplicationServices>(
  request: Request,
  actionId: string,
  identity: ERSCIdentity<ApplicationServices>,
) {
  const temporaryReferences = createTemporaryReferenceSet();
  const body = yield* readBody(request);
  const decoded = yield* Effect.tryPromise({
    try: () => decodeReply(body, { arraySizeLimit: ArgumentArraySizeLimit, temporaryReferences }),
    catch: (cause) => requestError('Failed to decode Server Function arguments.', 400, cause),
  });
  const args = yield* decodeArgumentArray(decoded).pipe(
    Effect.mapError((cause) =>
      requestError('Expected a Server Function argument array.', 400, cause),
    ),
  );
  const action = yield* Effect.try({
    try: () => loadServerAction(actionId),
    catch: (cause) => requestError('The requested Server Function does not exist.', 400, cause),
  });
  const operation = yield* prepareServerFnOperation(identity, action, args);

  return { operation, temporaryReferences } satisfies ServerFnCall<ApplicationServices>;
});
