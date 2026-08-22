import { Cause, Effect, Schema } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/server.node';

import { ServerFnIdHeader, type FlightPayload, type ServerFnResult } from '../rsc/flight';

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

export type ServerFnRequestResult = {
  readonly formState: FlightPayload['formState'];
  readonly serverFnResult: ServerFnResult | null;
  readonly status: number;
  readonly temporaryReferences?: TemporaryReferenceSet;
};

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

const readBody = Effect.fnUntraced(function* (request: Request, contentType: string | undefined) {
  if (contentType?.toLowerCase().startsWith('multipart/form-data') === true) {
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

const isEffectInvocation = (value: unknown): boolean => Effect.isEffect(value);

const invokeServerReference = <Services>(
  action: (...args: ReadonlyArray<unknown>) => unknown,
  args: ReadonlyArray<unknown>,
) =>
  Effect.suspend(() => {
    const invocation = action(...args);
    return isEffectInvocation(invocation)
      ? (invocation as Effect.Effect<unknown, never, Services>)
      : Effect.promise(() => Promise.resolve(invocation));
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
) {
  const temporaryReferences = createTemporaryReferenceSet();
  const body = yield* readBody(request, request.headers.get('content-type') ?? undefined);
  const args = yield* Effect.tryPromise({
    try: () => decodeReply(body, { temporaryReferences }),
    catch: (cause) => requestError('Failed to decode Server Function arguments.', 400, cause),
  });
  const action = yield* Effect.try({
    try: () => loadServerAction(actionId),
    catch: (cause) => requestError('The requested Server Function does not exist.', 400, cause),
  });
  const exit = yield* Effect.exit(invokeServerReference<Services>(action, args));
  const serverFnResult: ServerFnResult =
    exit._tag === 'Success'
      ? { ok: true, value: exit.value }
      : { error: Cause.squash(exit.cause), ok: false };

  return {
    formState: null,
    serverFnResult,
    status: exit._tag === 'Success' ? 200 : 500,
    temporaryReferences,
  } satisfies ServerFnRequestResult;
});

const runProgressiveServerFn = Effect.fnUntraced(function* <Services>(request: Request) {
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

  const actionResult = yield* invokeServerReference<Services>(decodedAction, []).pipe(
    Effect.mapError((error) =>
      requestError('The Server Function form action failed.', 500, error.cause),
    ),
  );
  const decodedFormState = yield* Effect.tryPromise({
    try: () => decodeFormState(actionResult, formData),
    catch: (cause) => requestError('Failed to decode React form state.', 500, cause),
  });

  return {
    formState: (decodedFormState ?? null) as FlightPayload['formState'],
    serverFnResult: null,
    status: 200,
  } satisfies ServerFnRequestResult;
});

export const handleServerFnRequest = Effect.fnUntraced(function* <Services>(
  request: HttpServerRequest.HttpServerRequest,
) {
  yield* validateOrigin(request);
  const signal = yield* Effect.abortSignal;
  const webRequest = yield* HttpServerRequest.toWeb(request, { signal });
  const actionId = request.headers[ServerFnIdHeader];

  return actionId === undefined
    ? yield* runProgressiveServerFn<Services>(webRequest)
    : yield* runClientServerFn<Services>(webRequest, actionId);
});
