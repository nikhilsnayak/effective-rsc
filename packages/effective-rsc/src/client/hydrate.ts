import { Effect, FiberSet, Schema, Stream } from 'effect';
import { HttpBody, HttpClient, HttpClientRequest } from 'effect/unstable/http';
import { createElement, startTransition, useEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import {
  createFromReadableStream,
  createTemporaryReferenceSet,
  encodeReply,
  setServerCallback,
} from 'react-server-dom-rspack/client.browser';
import { rscStream } from 'rsc-html-stream/client';

import { ServerFnIdHeader, type FlightPayload } from '../rsc/flight';

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
    const payload = yield* Effect.tryPromise<FlightPayload, BrowserHydrationError>({
      try: () => createFromReadableStream<FlightPayload>(rscStream),
      catch: (cause) => new BrowserHydrationError({ cause }),
    });
    let updatePayload: ((nextPayload: FlightPayload) => void) | null = null;

    function BrowserRoot() {
      const [currentPayload, setCurrentPayload] = useState(payload);

      useEffect(() => {
        updatePayload = (nextPayload) => {
          startTransition(() => setCurrentPayload(nextPayload));
        };

        return () => {
          updatePayload = null;
        };
      }, []);

      return currentPayload.root;
    }

    const callServer = Effect.fnUntraced(function* (id: string, args: ReadonlyArray<unknown>) {
      const temporaryReferences = createTemporaryReferenceSet();
      const body = yield* Effect.tryPromise({
        try: () => encodeReply(args, { temporaryReferences }),
        catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to encode arguments.' }),
      });
      const client = yield* HttpClient.HttpClient;
      const request = HttpClientRequest.post(window.location.href).pipe(
        HttpClientRequest.setHeaders({
          accept: 'text/x-component',
          [ServerFnIdHeader]: id,
        }),
        HttpClientRequest.setBody(HttpBody.raw(body)),
      );
      const response = yield* client
        .execute(request)
        .pipe(
          Effect.mapError(
            (cause) => new ServerFnCallError({ cause, message: 'Server Function request failed.' }),
          ),
        );
      const responseBody = yield* Stream.toReadableStreamEffect(response.stream);

      const nextPayload = yield* Effect.tryPromise({
        try: () =>
          createFromReadableStream<FlightPayload>(responseBody, {
            temporaryReferences,
          }),
        catch: (cause) => new ServerFnCallError({ cause, message: 'Failed to decode Flight.' }),
      });
      if (updatePayload === null) {
        return yield* new ServerFnCallError({
          cause: new Error('The hydrated React root has not mounted.'),
          message: 'Cannot apply the Server Function response yet.',
        });
      }

      updatePayload(nextPayload);
      if (nextPayload.serverFnResult === null) {
        return yield* new ServerFnCallError({
          cause: new Error('The Flight payload omitted the Server Function return value.'),
          message: 'Server Function response was incomplete.',
        });
      }
      if (!nextPayload.serverFnResult.ok) {
        return yield* new ServerFnCallError({
          cause: nextPayload.serverFnResult.error,
          message: 'Server Function execution failed.',
        });
      }

      return nextPayload.serverFnResult.value;
    });
    const runtime = yield* FiberSet.makeRuntimePromise<HttpClient.HttpClient>();

    yield* Effect.sync(() => {
      setServerCallback((id, args) => runtime(callServer(id, args)));
    });

    yield* Effect.try({
      try: () =>
        hydrateRoot(document, createElement(BrowserRoot), {
          formState: payload.formState,
        }),
      catch: (cause) => new BrowserHydrationError({ cause }),
    });

    return yield* Effect.never;
  }),
);
