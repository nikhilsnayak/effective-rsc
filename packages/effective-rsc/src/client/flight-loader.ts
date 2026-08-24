import { Effect, Exit, Schema, Scope, Stream } from 'effect';
import { HttpBody, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import {
  createFromReadableStream,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/client.browser';

import { FlightMediaType, ServerFnIdHeader, type FlightPayload } from '../rsc/flight';

export class FlightLoadError extends Schema.TaggedError<FlightLoadError>()('FlightLoadError', {
  cause: Schema.Defect(),
  reason: Schema.Literals(['RequestFailed', 'UnexpectedResponse', 'DecodeFailed']),
}) {}

type FlightRequest =
  | {
      readonly _tag: 'Navigation';
      readonly destination: URL;
    }
  | {
      readonly _tag: 'ServerFunction';
      readonly body: BodyInit;
      readonly destination: URL;
      readonly id: string;
      readonly temporaryReferences: TemporaryReferenceSet;
    };

export const loadFlight = Effect.fnUntraced(function* (flightRequest: FlightRequest) {
  const parentScope = yield* Effect.scope;
  const responseScope = yield* Scope.fork(parentScope);
  const release = Scope.close(responseScope, Exit.void);

  return yield* Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const client = httpClient.pipe(HttpClient.filterStatusOk, HttpClient.withScope);
    const request =
      flightRequest._tag === 'Navigation'
        ? HttpClientRequest.get(flightRequest.destination).pipe(
            HttpClientRequest.setHeader('accept', FlightMediaType),
          )
        : HttpClientRequest.post(flightRequest.destination).pipe(
            HttpClientRequest.setHeaders({
              accept: FlightMediaType,
              [ServerFnIdHeader]: flightRequest.id,
            }),
            HttpClientRequest.setBody(HttpBody.raw(flightRequest.body)),
          );
    const response = yield* client.execute(request).pipe(
      Scope.provide(responseScope),
      Effect.mapError(
        (cause) =>
          new FlightLoadError({
            cause,
            reason: 'RequestFailed',
          }),
      ),
    );
    const contentType = response.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== FlightMediaType) {
      return yield* new FlightLoadError({
        cause: new Error(
          `Expected a ${FlightMediaType} response, received ${response.headers['content-type'] ?? 'no content type'}.`,
        ),
        reason: 'UnexpectedResponse',
      });
    }

    const responseBody = yield* Stream.toReadableStreamEffect(
      response.stream.pipe(Stream.ensuring(release)),
    );
    const payload = yield* Effect.tryPromise({
      try: () =>
        createFromReadableStream<FlightPayload>(
          responseBody,
          flightRequest._tag === 'ServerFunction'
            ? { temporaryReferences: flightRequest.temporaryReferences }
            : undefined,
        ),
      catch: (cause) =>
        new FlightLoadError({
          cause,
          reason: 'DecodeFailed',
        }),
    });

    return { payload, release };
  }).pipe(Effect.onError(() => release));
});
