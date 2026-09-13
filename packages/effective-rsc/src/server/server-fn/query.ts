import { Effect } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import type { TemporaryReferenceSet } from 'react-server-dom-rspack/server.node';

import type { ERSCIdentity } from '../../application/ersc-identity';
import type { AnyMiddleware } from '../../application/middleware';
import { ServerFnIdHeader, type ServerFnResponseModel } from '../../rsc/flight';
import {
  decodeServerFnCall,
  requestError,
  type ServerFnRequestError,
  toWebRequest,
  validateOrigin,
} from './request';
import { serverFnResponse } from './response';

export type ServerFnQueryOutcome = {
  readonly result: ServerFnResponseModel;
  readonly temporaryReferences: TemporaryReferenceSet;
};

export type PreparedServerFnQuery<ApplicationServices> = {
  readonly execute: Effect.Effect<ServerFnQueryOutcome, ServerFnRequestError, ApplicationServices>;
  readonly middleware: ReadonlyArray<AnyMiddleware<ApplicationServices>>;
};

export const prepareServerFnQuery = Effect.fnUntraced(function* <Services>(
  request: HttpServerRequest.HttpServerRequest,
  identity: ERSCIdentity<Services>,
) {
  yield* validateOrigin(request);
  const actionId = request.headers[ServerFnIdHeader];
  if (actionId === undefined) {
    return yield* requestError(
      'A query request must identify its Server Function.',
      400,
      new Error(`Missing the ${ServerFnIdHeader} header.`),
    );
  }

  const webRequest = yield* toWebRequest(request);
  const { operation, temporaryReferences } = yield* decodeServerFnCall(
    webRequest,
    actionId,
    identity,
  );

  return {
    execute: serverFnResponse(operation.effect).pipe(
      Effect.map((result) => ({ result, temporaryReferences }) satisfies ServerFnQueryOutcome),
    ),
    middleware: operation.middleware,
  } satisfies PreparedServerFnQuery<Services>;
});
