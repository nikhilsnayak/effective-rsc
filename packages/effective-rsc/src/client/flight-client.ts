// oxlint-disable effecttsgo/process-env-in-effect -- Rspack replaces NODE_ENV at compile time.
import { Context, Deferred, Effect, Exit, Layer, Schema, Scope, Stream } from 'effect';
import { HttpBody, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import {
  createFromReadableStream,
  type TemporaryReferenceSet,
} from 'react-server-dom-rspack/client.browser';

import {
  FlightMediaType,
  ServerFnIdHeader,
  type RouteResponseModel,
  type ServerFnResponseModel,
} from '../rsc/flight';
import { InitialFlightStream } from './initial-flight-stream';

export class FlightLoadError extends Schema.TaggedError<FlightLoadError>()('FlightLoadError', {
  cause: Schema.Defect(),
  reason: Schema.Literals(['RequestFailed', 'UnexpectedResponse', 'DecodeFailed']),
}) {}

export type FlightRequest =
  | {
      readonly _tag: 'Navigation';
      readonly destination: URL;
    }
  | {
      readonly _tag: 'Mutation' | 'Query';
      readonly body: BodyInit;
      readonly destination: URL;
      readonly id: string;
      readonly temporaryReferences: TemporaryReferenceSet;
    };

type DecodedFlight<Model> = {
  readonly completed: Effect.Effect<void, FlightLoadError>;
  readonly model: Model;
};

type FlightResource<Model> = DecodedFlight<Model> & {
  readonly _tag: 'Flight';
  readonly release: Effect.Effect<void>;
  readonly resolvedUrl: URL;
};

type FlightResponseModel<Request extends FlightRequest> = Request extends {
  readonly _tag: 'Query';
}
  ? ServerFnResponseModel
  : RouteResponseModel;

type DocumentResource = {
  readonly _tag: 'Document';
  readonly release: Effect.Effect<void>;
};

export class FlightClient extends Context.Service<FlightClient>()('ersc/client/FlightClient', {
  make: Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const initialFlight = yield* InitialFlightStream;

    const loadInitial = Effect.gen(function* () {
      const completed = Promise.withResolvers<void>();
      const stream = initialFlight.stream.pipeThrough(
        new TransformStream({
          flush: () => completed.resolve(),
          transform: (chunk, controller) => controller.enqueue(chunk),
        }),
      );
      const model = yield* Effect.tryPromise({
        try: () =>
          createFromReadableStream<RouteResponseModel>(
            stream,
            process.env.NODE_ENV === 'development' ? { startTime: 0 } : undefined,
          ),
        catch: (cause) => new FlightLoadError({ cause, reason: 'DecodeFailed' }),
      });

      return {
        completed: Effect.promise(() => completed.promise),
        model,
      } satisfies DecodedFlight<RouteResponseModel>;
    });

    const load = Effect.fnUntraced(function* <Request extends FlightRequest>(
      flightRequest: Request,
    ) {
      const parentScope = yield* Effect.scope;
      const responseScope = yield* Scope.fork(parentScope);
      const release = Scope.close(responseScope, Exit.void);

      return yield* Effect.gen(function* () {
        const client = httpClient.pipe(HttpClient.withScope);
        const request =
          flightRequest._tag === 'Navigation'
            ? HttpClientRequest.get(flightRequest.destination).pipe(
                HttpClientRequest.setHeader('accept', FlightMediaType),
              )
            : HttpClientRequest.make(
                // @ts-expect-error Effect's HttpMethod union predates RFC 10008 QUERY.
                flightRequest._tag === 'Query' ? 'QUERY' : 'POST',
              )(flightRequest.destination).pipe(
                HttpClientRequest.setHeaders({
                  accept: FlightMediaType,
                  [ServerFnIdHeader]: flightRequest.id,
                }),
                HttpClientRequest.setBody(HttpBody.raw(flightRequest.body)),
              );
        const requestStartTime = process.env.NODE_ENV === 'development' ? performance.now() : 0;
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
        if (response.status < 200 || response.status >= 300) {
          if (flightRequest._tag === 'Navigation') {
            return { _tag: 'Document', release } satisfies DocumentResource;
          }
          return yield* new FlightLoadError({
            cause: new Error(`Flight request failed with status ${response.status}.`),
            reason: 'RequestFailed',
          });
        }
        const contentType = response.headers['content-type']
          ?.split(';', 1)[0]
          ?.trim()
          .toLowerCase();
        if (contentType !== FlightMediaType) {
          if (flightRequest._tag === 'Navigation') {
            return { _tag: 'Document', release } satisfies DocumentResource;
          }
          return yield* new FlightLoadError({
            cause: new Error(
              `Expected a ${FlightMediaType} response, received ${response.headers['content-type'] ?? 'no content type'}.`,
            ),
            reason: 'UnexpectedResponse',
          });
        }

        if (response.url === '') {
          return yield* new FlightLoadError({
            cause: new Error('Expected the Flight response to include a resolved URL.'),
            reason: 'UnexpectedResponse',
          });
        }
        const resolvedUrl = yield* Effect.try({
          try: () => new URL(response.url),
          catch: (cause) =>
            new FlightLoadError({
              cause,
              reason: 'UnexpectedResponse',
            }),
        });

        const completed = yield* Deferred.make<void, FlightLoadError>();
        const responseBody = yield* Stream.toReadableStreamEffect(
          response.stream.pipe(
            Stream.onExit((exit) =>
              Deferred.done(
                completed,
                exit.pipe(
                  Exit.mapError(
                    (cause) =>
                      new FlightLoadError({
                        cause,
                        reason: 'RequestFailed',
                      }),
                  ),
                  Exit.asVoid,
                ),
              ),
            ),
            Stream.ensuring(release),
          ),
        );
        const decodeOptions =
          flightRequest._tag !== 'Navigation'
            ? process.env.NODE_ENV === 'development'
              ? {
                  startTime: requestStartTime,
                  temporaryReferences: flightRequest.temporaryReferences,
                }
              : { temporaryReferences: flightRequest.temporaryReferences }
            : process.env.NODE_ENV === 'development'
              ? {
                  startTime: requestStartTime,
                }
              : undefined;
        const model = yield* Effect.tryPromise({
          try: () =>
            createFromReadableStream<FlightResponseModel<Request>>(responseBody, decodeOptions),
          catch: (cause) =>
            new FlightLoadError({
              cause,
              reason: 'DecodeFailed',
            }),
        });

        return {
          _tag: 'Flight',
          completed: Deferred.await(completed),
          model,
          release,
          resolvedUrl,
        } satisfies FlightResource<FlightResponseModel<Request>>;
      }).pipe(Effect.onError(() => release));
    });

    return { load, loadInitial };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
