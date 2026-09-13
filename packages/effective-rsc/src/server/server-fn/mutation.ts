import { Effect, type Scope } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import { decodeAction, decodeFormState } from 'react-server-dom-rspack/server.node';

import type { ERSCIdentity } from '../../application/ersc-identity';
import type { AnyMiddleware } from '../../application/middleware';
import { ServerFnIdHeader } from '../../rsc/flight';
import type { RequestOutcome } from '../request-outcome';
import {
  decodeServerFnCall,
  prepareServerFnOperation,
  requestError,
  type ServerFnRequestError,
  toWebRequest,
  validateOrigin,
} from './request';
import { serverFnResponse } from './response';

export type PreparedServerFnMutation<ApplicationServices> = {
  readonly execute: Effect.Effect<
    RequestOutcome,
    ServerFnRequestError,
    ApplicationServices | Scope.Scope
  >;
  readonly middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>;
};

const prepareInvocation = Effect.fnUntraced(function* <ApplicationServices>(
  request: Request,
  actionId: string,
  identity: ERSCIdentity<ApplicationServices>,
) {
  const { operation, temporaryReferences } = yield* decodeServerFnCall(request, actionId, identity);

  return {
    execute: serverFnResponse(operation.effect).pipe(
      Effect.map(
        (result) =>
          ({
            formState: null,
            serverFnResponse: result,
            status: 200,
            temporaryReferences,
          }) satisfies RequestOutcome,
      ),
    ),
    middleware: operation.middleware,
  } satisfies PreparedServerFnMutation<ApplicationServices>;
});

const prepareFormSubmission = Effect.fnUntraced(function* <ApplicationServices>(
  request: Request,
  identity: ERSCIdentity<ApplicationServices>,
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

  const operation = yield* prepareServerFnOperation(identity, decodedAction, []);
  const execute = Effect.gen(function* () {
    const actionResult = yield* operation.effect.pipe(
      Effect.mapError((error) =>
        requestError('The Server Function rejected its form input.', 400, error.cause),
      ),
    );
    const formState = yield* Effect.tryPromise({
      try: () => decodeFormState(actionResult, formData),
      catch: (cause) => requestError('Failed to decode React form state.', 500, cause),
    });

    return { formState, serverFnResponse: null, status: 200 } satisfies RequestOutcome;
  });

  return {
    execute,
    middleware: operation.middleware,
  } satisfies PreparedServerFnMutation<ApplicationServices>;
});

export const prepareServerFnMutation = Effect.fnUntraced(function* <Services>(
  request: HttpServerRequest.HttpServerRequest,
  identity: ERSCIdentity<Services>,
) {
  yield* validateOrigin(request);
  const webRequest = yield* toWebRequest(request);
  const actionId = request.headers[ServerFnIdHeader];

  return yield* actionId === undefined
    ? prepareFormSubmission(webRequest, identity)
    : prepareInvocation(webRequest, actionId, identity);
});

export type ServerFnMutationFailure = Effect.Error<ReturnType<typeof prepareServerFnMutation>>;
