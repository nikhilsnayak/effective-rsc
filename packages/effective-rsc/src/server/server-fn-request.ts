import { Cause, Effect, Schema } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
} from 'react-server-dom-rspack/server.node';

import type { ERSCIdentity } from '../application/ersc-identity';
import { matchServerFnInvocation } from '../application/server-fn';
import { ServerFnIdHeader } from '../rsc/flight';
import type { RequestOutcome } from './request-outcome';
import { serverFnOutcome } from './server-fn-outcome';

export class ServerFnRequestError extends Schema.TaggedError<ServerFnRequestError>()(
  'ServerFnRequestError',
  {
    cause: Schema.Defect(),
    message: Schema.String,
    status: Schema.Literals([400, 403, 500]),
  },
) {}

class ServerFnExecutionError extends Schema.TaggedError<ServerFnExecutionError>()(
  'ServerFnExecutionError',
  { cause: Schema.Defect() },
) {}

class ServerFnIdentityMismatchError extends Schema.TaggedError<ServerFnIdentityMismatchError>()(
  'ServerFnIdentityMismatchError',
  {},
) {}

const requestError = (message: string, status: 400 | 403 | 500, cause: unknown) =>
  new ServerFnRequestError({ cause, message, status });

const validateOrigin = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.try({
    try: () => {
      const origin = request.headers['origin'];
      if (origin === undefined) {
        return;
      }

      const forwardedHost = request.headers['x-forwarded-host']?.split(',')[0]?.trim();
      const expectedHost = forwardedHost ?? request.headers['host'];
      if (expectedHost === undefined || new URL(origin).host !== expectedHost) {
        throw new Error(`Origin "${origin}" does not match host "${expectedHost ?? ''}".`);
      }
    },
    catch: (cause) => requestError('Rejected a cross-origin Server Function request.', 403, cause),
  });

const readBody = Effect.fnUntraced(function* (request: Request) {
  if (request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    return yield* Effect.tryPromise({
      try: () => request.formData(),
      catch: (cause) =>
        requestError('Failed to read the Server Function request body.', 400, cause),
    });
  }

  return yield* Effect.tryPromise({
    try: () => request.text(),
    catch: (cause) => requestError('Failed to read the Server Function request body.', 400, cause),
  });
});

const invokeServerReference = <Services>(
  identity: ERSCIdentity<Services>,
  action: (...args: ReadonlyArray<unknown>) => unknown,
  args: ReadonlyArray<unknown>,
) =>
  Effect.suspend(() => {
    const invocation = action(...args);
    const match = matchServerFnInvocation(invocation, identity);
    switch (match._tag) {
      case 'Match':
        return match.effect;
      case 'IdentityMismatch':
        return Effect.die(new ServerFnIdentityMismatchError());
      case 'Native':
        return Effect.promise(() => Promise.resolve(invocation));
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.interrupt
        : Effect.fail(new ServerFnExecutionError({ cause: Cause.squash(cause) })),
    ),
  );

const runClientServerFn = Effect.fnUntraced(function* <Services>(
  request: Request,
  actionId: string,
  identity: ERSCIdentity<Services>,
) {
  const temporaryReferences = createTemporaryReferenceSet();
  const body = yield* readBody(request);
  const args = yield* Effect.tryPromise({
    try: () => decodeReply(body, { temporaryReferences }),
    catch: (cause) => requestError('Failed to decode Server Function arguments.', 400, cause),
  });
  const action = yield* Effect.try({
    try: () => loadServerAction(actionId),
    catch: (cause) => requestError('The requested Server Function does not exist.', 400, cause),
  });
  const outcome = yield* serverFnOutcome(invokeServerReference(identity, action, args));

  return {
    formState: null,
    ...outcome,
    temporaryReferences,
  } satisfies RequestOutcome;
});

const runProgressiveServerFn = Effect.fnUntraced(function* <Services>(
  request: Request,
  identity: ERSCIdentity<Services>,
) {
  const formData = yield* Effect.tryPromise({
    try: () => request.formData(),
    catch: (cause) => requestError('Failed to read the Server Function form body.', 400, cause),
  });
  const decodedAction = yield* Effect.tryPromise({
    try: () => Promise.resolve(decodeAction(formData)),
    catch: (cause) => requestError('Failed to decode the Server Function form action.', 400, cause),
  });
  if (decodedAction === null) {
    return yield* requestError(
      'The submitted form does not contain a Server Function action.',
      400,
      new Error('decodeAction returned null.'),
    );
  }

  const actionResult = yield* invokeServerReference(identity, decodedAction, []).pipe(
    Effect.mapError((error) =>
      requestError('The Server Function form action failed.', 500, error.cause),
    ),
  );
  const decodedFormState = yield* Effect.tryPromise({
    try: () => decodeFormState(actionResult, formData),
    catch: (cause) => requestError('Failed to decode React form state.', 500, cause),
  });

  return {
    formState: decodedFormState,
    serverFnResult: null,
    status: 200,
  } satisfies RequestOutcome;
});

export const handleServerFnRequest = Effect.fnUntraced(function* <Services>(
  request: HttpServerRequest.HttpServerRequest,
  identity: ERSCIdentity<Services>,
) {
  yield* validateOrigin(request);
  const signal = yield* Effect.abortSignal;
  const webRequest = yield* HttpServerRequest.toWeb(request, { signal });
  const actionId = request.headers[ServerFnIdHeader];
  const handleRequest =
    actionId === undefined
      ? runProgressiveServerFn(webRequest, identity)
      : runClientServerFn(webRequest, actionId, identity);

  return yield* handleRequest;
});
