// oxlint-disable-next-line effecttsgo/node-builtin-import -- This test exercises Rsbuild's Node-compatible Connect boundary.
import { createServer, request as makeRequest, type Server } from 'node:http';

import { expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { makeDevMiddleware } from '../../src/build/dev-middleware';

class DevMiddlewareTestError extends Schema.TaggedError<DevMiddlewareTestError>()(
  'DevMiddlewareTestError',
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const closeServer = (server: Server) =>
  Effect.callback<void>((resume) => {
    if (!server.listening) {
      resume(Effect.void);
      return;
    }

    server.closeAllConnections();
    server.close(() => resume(Effect.void));
  });

it.effect('interrupts a development request when its client disconnects', () =>
  Effect.gen(function* () {
    const started = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const middlewareErrors: Array<unknown> = [];
    const observed: { requestSignal?: AbortSignal } = {};
    const middleware = makeDevMiddleware(() => (request) => {
      observed.requestSignal = request.signal;
      started.resolve();
      const response = Promise.withResolvers<Response>();

      request.signal.addEventListener(
        'abort',
        () => {
          aborted.resolve();
          response.reject(request.signal.reason);
        },
        { once: true },
      );

      return response.promise;
    });
    const server = yield* Effect.acquireRelease(
      Effect.callback<Server, DevMiddlewareTestError>((resume) => {
        const server = createServer((request, response) => {
          middleware(request, response, (cause) => {
            middlewareErrors.push(cause);
          });
        });
        const onError = (cause: Error) =>
          resume(
            Effect.fail(
              new DevMiddlewareTestError({
                message: 'Failed to start the development middleware test server.',
                cause,
              }),
            ),
          );

        server.once('error', onError);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', onError);
          resume(Effect.succeed(server));
        });

        return Effect.sync(() => {
          server.off('error', onError);
          if (server.listening) {
            server.close();
          }
        });
      }),
      closeServer,
    );
    const address = server.address();

    if (address === null || typeof address === 'string') {
      return yield* new DevMiddlewareTestError({
        message: 'Expected the development middleware test server to use a TCP port.',
        cause: new Error('The server did not expose a TCP address.'),
      });
    }

    const clientRequest = makeRequest({
      host: '127.0.0.1',
      method: 'GET',
      path: '/',
      port: address.port,
    });
    clientRequest.on('error', () => undefined);
    clientRequest.end();

    yield* Effect.promise(() => started.promise);
    clientRequest.destroy();
    yield* Effect.promise(() => aborted.promise);

    expect(observed.requestSignal?.aborted).toBe(true);
    expect(middlewareErrors).toEqual([]);
  }),
);
