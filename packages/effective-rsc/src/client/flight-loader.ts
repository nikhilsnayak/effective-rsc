import { Effect, Exit, Schema, Scope, Stream } from 'effect';
import { HttpClient, HttpClientRequest, type HttpClientResponse } from 'effect/unstable/http';
import {
  createFromReadableStream,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/client.browser';

import { FlightMediaType, type FlightPayload } from '../rsc/flight';

export class FlightLoadError extends Schema.TaggedError<FlightLoadError>()('FlightLoadError', {
  cause: Schema.Defect(),
  reason: Schema.Literals(['RequestFailed', 'UnexpectedResponse', 'DecodeFailed']),
}) {}

type FlightRequest =
  | {
      readonly _tag: 'Navigation';
      readonly request: HttpClientRequest.HttpClientRequest;
    }
  | {
      readonly _tag: 'ServerFunction';
      readonly request: HttpClientRequest.HttpClientRequest;
      readonly temporaryReferences: TemporaryReferenceSet;
    };

const hasFlightContentType = (response: HttpClientResponse.HttpClientResponse) =>
  response.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() === FlightMediaType;

const loadFlightPayload = Effect.fnUntraced(function* ({
  flightRequest,
  responseScope,
}: {
  readonly flightRequest: FlightRequest;
  readonly responseScope: Scope.Scope;
}) {
  const httpClient = yield* HttpClient.HttpClient;
  const client = httpClient.pipe(HttpClient.filterStatusOk, HttpClient.withScope);
  const response = yield* client.execute(flightRequest.request).pipe(
    Scope.provide(responseScope),
    Effect.mapError(
      (cause) =>
        new FlightLoadError({
          cause,
          reason: 'RequestFailed',
        }),
    ),
  );

  if (!hasFlightContentType(response)) {
    return yield* new FlightLoadError({
      cause: new Error(
        `Expected a ${FlightMediaType} response, received ${response.headers['content-type'] ?? 'no content type'}.`,
      ),
      reason: 'UnexpectedResponse',
    });
  }

  const responseBody = yield* Stream.toReadableStreamEffect(
    response.stream.pipe(Stream.ensuring(Scope.close(responseScope, Exit.void))),
  );
  return yield* Effect.tryPromise({
    try: () => {
      switch (flightRequest._tag) {
        case 'Navigation':
          return createFromReadableStream<FlightPayload>(responseBody);
        case 'ServerFunction':
          return createFromReadableStream<FlightPayload>(responseBody, {
            temporaryReferences: flightRequest.temporaryReferences,
          });
      }
    },
    catch: (cause) =>
      new FlightLoadError({
        cause,
        reason: 'DecodeFailed',
      }),
  });
});

export const requestFlight = Effect.fnUntraced(function* (flightRequest: FlightRequest) {
  const parentScope = yield* Effect.scope;
  const responseScope = yield* Scope.fork(parentScope);
  const release = Scope.close(responseScope, Exit.void);
  const payload = yield* loadFlightPayload({ flightRequest, responseScope }).pipe(
    Effect.onError(() => release),
  );

  return { payload, release };
});

export const loadFlight = (destination: URL) =>
  requestFlight({
    _tag: 'Navigation',
    request: HttpClientRequest.get(destination).pipe(
      HttpClientRequest.setHeader('accept', FlightMediaType),
    ),
  });
