import { Effect, FiberSet, Schema, Scope } from 'effect';
import { HttpBody, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import {
  createFromReadableStream,
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import { FlightMediaType, ServerFnIdHeader, type FlightPayload } from '../rsc/flight';
import { hydrateBrowserRoot } from './browser-root';
import { requestFlight } from './flight-loader';

export class BrowserHydrationError extends Schema.TaggedError<BrowserHydrationError>()(
  'BrowserHydrationError',
  { cause: Schema.Defect() },
) {}

export class ServerFnCallError extends Schema.TaggedError<ServerFnCallError>()(
  'ServerFnCallError',
  {
    cause: Schema.Defect(),
    message: Schema.String,
  },
) {}

export const hydrate = Effect.scoped(
  Effect.gen(function* () {
    const payload = yield* Effect.tryPromise({
      try: () => createFromReadableStream<FlightPayload>(rscStream),
      catch: (cause) => new BrowserHydrationError({ cause }),
    });
    const browserRoot = yield* hydrateBrowserRoot(document, payload).pipe(
      Effect.mapError((cause) => new BrowserHydrationError({ cause })),
    );

    const callServer = Effect.fnUntraced(function* (id: string, args: ReadonlyArray<unknown>) {
      const temporaryReferences = createTemporaryReferenceSet();
      const body = yield* Effect.tryPromise({
        try: () => encodeReply(args, { temporaryReferences }),
        catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to encode arguments.' }),
      });
      const request = HttpClientRequest.post(window.location.href).pipe(
        HttpClientRequest.setHeaders({
          accept: FlightMediaType,
          [ServerFnIdHeader]: id,
        }),
        HttpClientRequest.setBody(HttpBody.raw(body)),
      );
      const resource = yield* requestFlight({
        _tag: 'ServerFunction',
        request,
        temporaryReferences,
      }).pipe(
        Effect.mapError(
          (cause) => new ServerFnCallError({ cause, message: 'Server Function request failed.' }),
        ),
      );
      const { committed } = yield* browserRoot
        .schedule({ _tag: 'ServerFunction', payload: resource.payload })
        .pipe(
          Effect.mapError(
            (cause) =>
              new ServerFnCallError({
                cause,
                message: 'Cannot apply the Server Function response yet.',
              }),
          ),
          Effect.onError(() => resource.release),
        );
      yield* committed.pipe(
        Effect.onError(() => resource.release),
        Effect.forkScoped,
      );
      const serverFnResult = resource.payload.serverFnResult;
      if (serverFnResult === null) {
        return yield* new ServerFnCallError({
          cause: new Error('The Flight payload omitted the Server Function return value.'),
          message: 'Server Function response was incomplete.',
        });
      }
      switch (serverFnResult._tag) {
        case 'Failure':
          return yield* new ServerFnCallError({
            cause: serverFnResult.error,
            message: 'Server Function execution failed.',
          });
        case 'Success':
          return serverFnResult.value;
      }
    });
    const runtime = yield* FiberSet.makeRuntimePromise<HttpClient.HttpClient | Scope.Scope>();

    yield* Effect.sync(() => {
      setServerCallback((id, args) => runtime(callServer(id, args)));
    });

    return yield* Effect.never;
  }),
);
