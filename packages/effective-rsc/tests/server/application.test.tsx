import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it, vi } from '@effect/vitest';
import { Context, Effect, Layer } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { Application } from '../../src/application/ersc';
import { ServerFnIdHeader } from '../../src/rsc/flight';
import { ServerConfig } from '../../src/server/server-config';

const decodeAction = vi.fn(() => Promise.resolve(null));
const decodeReply = vi.fn(() => Promise.resolve([]));

vi.doMock('react-server-dom-rspack/server.node', () => ({
  createTemporaryReferenceSet: () => ({}),
  decodeAction,
  decodeFormState: () => Promise.resolve(null),
  decodeReply,
  loadServerAction: () => {
    throw new Error('Unexpected Server Function action load.');
  },
  renderToReadableStream: () => {
    throw new Error('Routes middleware should short-circuit Flight rendering.');
  },
}));

const { ServerApplication } = await import('../../src/server/application');

class RequestTrace extends Context.Service<RequestTrace, { readonly events: Array<string> }>()(
  'ersc/tests/server/application/RequestTrace',
) {}

const ServerConfigLayer = Layer.succeed(
  ServerConfig,
  ServerConfig.of({
    clientAssetsRoot: '/tmp/ersc-test-assets',
    clientBootstrapScripts: ['/_ersc/assets/client.js'],
    clientStylesheets: [],
    hostname: 'localhost',
    port: 18193,
    publicAssetsRoot: '/tmp/ersc-test-public-assets',
  }),
);

describe('ServerApplication.httpLayer', () => {
  it.effect('composes application, Routes, and global HTTP concerns in one router', () => {
    decodeAction.mockClear();
    decodeReply.mockClear();
    const events: Array<string> = [];
    let acquisitions = 0;
    let globalRequests = 0;
    const ERSC = Application.ersc<RequestTrace>();
    const Outer = ERSC.Routes.middleware({
      handler: (httpEffect) =>
        Effect.gen(function* () {
          const trace = yield* RequestTrace;
          trace.events.push('outer:request');
          const response = yield* httpEffect;
          trace.events.push('outer:response');
          const innerOrder = response.headers['x-middleware-order'];
          return HttpServerResponse.setHeader(
            response,
            'x-middleware-order',
            innerOrder === undefined ? 'outer' : `${innerOrder},outer`,
          );
        }),
    });
    const Inner = ERSC.Routes.middleware({
      handler: () =>
        Effect.gen(function* () {
          const trace = yield* RequestTrace;
          const request = yield* HttpServerRequest.HttpServerRequest;
          expect(request.url).toBe('/protected');
          trace.events.push('inner:request');
          const response = HttpServerResponse.text('Routes middleware response');
          trace.events.push('inner:response');
          return HttpServerResponse.setHeader(response, 'x-middleware-order', 'inner');
        }),
    });
    const RootLayout = ERSC.Layout.make({
      render: ({ children }) => Effect.succeed(<html lang='en'>{children}</html>),
    });
    const Page = ERSC.Page.make({
      render: () => Effect.die('Routes middleware should short-circuit Page rendering.'),
    });
    const RequestTraceLayer = Layer.effect(
      RequestTrace,
      Effect.sync(() => {
        acquisitions += 1;
        return RequestTrace.of({ events });
      }),
    );
    const GlobalMiddlewareLayer = HttpRouter.middleware(
      (httpEffect) =>
        Effect.andThen(
          Effect.sync(() => {
            globalRequests += 1;
          }),
          Effect.map(httpEffect, HttpServerResponse.setHeader('x-global-middleware', 'true')),
        ),
      { global: true },
    );
    const ApiLayer = HttpRouter.add(
      'GET',
      '/api/health',
      Effect.map(RequestTrace, ({ events: requestEvents }) => {
        requestEvents.push('api');
        return HttpServerResponse.text('healthy');
      }),
    ).pipe(HttpRouter.provideRequest(RequestTraceLayer));
    const ApplicationLayer = Layer.mergeAll(RequestTraceLayer, GlobalMiddlewareLayer, ApiLayer);
    const App = ERSC.make({
      layer: ApplicationLayer,
      routes: ERSC.Routes.make({
        layout: RootLayout,
        middleware: [Outer],
      }).mount('/protected', ERSC.Routes.make({ middleware: [Inner] }).page('/', Page)),
    });
    const HttpLayer = ServerApplication.httpLayer(App).pipe(
      Layer.provide(ServerConfigLayer),
      Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunHttpPlatform.layer, BunPath.layer)),
    );

    return Effect.acquireUseRelease(
      Effect.sync(() => HttpRouter.toWebHandler(HttpLayer, { disableLogger: true })),
      ({ handler }) =>
        Effect.gen(function* () {
          const pageResponse = yield* Effect.promise(() =>
            handler(new Request('http://effective-rsc.test/protected')),
          );
          expect(pageResponse.status).toBe(200);
          expect(pageResponse.headers.get('x-middleware-order')).toBe('inner,outer');
          expect(pageResponse.headers.get('x-global-middleware')).toBe('true');
          expect(yield* Effect.promise(() => pageResponse.text())).toBe(
            'Routes middleware response',
          );
          expect(events).toEqual([
            'outer:request',
            'inner:request',
            'inner:response',
            'outer:response',
          ]);

          events.length = 0;
          const headResponse = yield* Effect.promise(() =>
            handler(
              new Request('http://effective-rsc.test/protected', {
                method: 'HEAD',
              }),
            ),
          );
          expect(headResponse.status).toBe(200);
          expect(headResponse.headers.get('x-middleware-order')).toBe('inner,outer');
          expect(events).toEqual([
            'outer:request',
            'inner:request',
            'inner:response',
            'outer:response',
          ]);

          events.length = 0;
          const missingOriginResponse = yield* Effect.promise(() =>
            handler(
              new Request('http://effective-rsc.test/protected', {
                headers: { host: 'effective-rsc.test' },
                method: 'POST',
              }),
            ),
          );
          expect(missingOriginResponse.status).toBe(403);

          const crossOriginResponse = yield* Effect.promise(() =>
            handler(
              new Request('http://effective-rsc.test/protected', {
                headers: {
                  host: 'effective-rsc.test',
                  origin: 'https://cross-origin.example',
                },
                method: 'POST',
              }),
            ),
          );
          expect(crossOriginResponse.status).toBe(403);

          const forwardedOriginResponse = yield* Effect.promise(() =>
            handler(
              new Request('http://effective-rsc.test/protected', {
                headers: {
                  host: 'internal-proxy.test',
                  origin: 'https://public.example',
                  [ServerFnIdHeader]: 'forwarded-origin',
                  'x-forwarded-host': 'public.example, internal-proxy.test',
                },
                method: 'POST',
              }),
            ),
          );
          expect(forwardedOriginResponse.status).toBe(400);
          expect(decodeReply).toHaveBeenCalledTimes(1);

          const wrongForwardedOriginResponse = yield* Effect.promise(() =>
            handler(
              new Request('http://effective-rsc.test/protected', {
                headers: {
                  host: 'internal-proxy.test',
                  origin: 'https://internal-proxy.test',
                  [ServerFnIdHeader]: 'wrong-forwarded-origin',
                  'x-forwarded-host': 'public.example, internal-proxy.test',
                },
                method: 'POST',
              }),
            ),
          );
          expect(wrongForwardedOriginResponse.status).toBe(403);
          expect(decodeReply).toHaveBeenCalledTimes(1);

          const knownOversizedResponse = yield* Effect.promise(() =>
            handler(
              new Request('http://effective-rsc.test/protected', {
                headers: {
                  'content-length': String(10 * 1024 * 1024 + 1),
                  host: 'effective-rsc.test',
                  origin: 'http://effective-rsc.test',
                  [ServerFnIdHeader]: 'known-oversized',
                },
                method: 'POST',
              }),
            ),
          );
          expect(knownOversizedResponse.status).toBe(413);

          const chunk = new Uint8Array(64 * 1024);
          let chunksRemaining = 161;
          const streamingBody = new ReadableStream<Uint8Array>({
            pull(controller) {
              if (chunksRemaining === 0) {
                controller.close();
                return;
              }
              chunksRemaining -= 1;
              controller.enqueue(chunk);
            },
          });
          const streamingRequestInit: RequestInit & { readonly duplex: 'half' } = {
            body: streamingBody,
            duplex: 'half',
            headers: {
              host: 'effective-rsc.test',
              origin: 'http://effective-rsc.test',
              [ServerFnIdHeader]: 'streaming-oversized',
            },
            method: 'POST',
          };
          const streamingOversizedResponse = yield* Effect.promise(() =>
            handler(new Request('http://effective-rsc.test/protected', streamingRequestInit)),
          );
          expect(streamingOversizedResponse.status).toBe(413);
          expect(decodeReply).toHaveBeenCalledTimes(1);

          const serverFnResponse = yield* Effect.promise(() =>
            handler(
              new Request('http://effective-rsc.test/protected', {
                headers: {
                  host: 'effective-rsc.test',
                  origin: 'http://effective-rsc.test',
                  [ServerFnIdHeader]: 'direct-host',
                },
                method: 'POST',
              }),
            ),
          );
          expect(serverFnResponse.status).toBe(400);
          expect(serverFnResponse.headers.get('cache-control')).toBe('private, no-store');
          expect(serverFnResponse.headers.get('vary')).toBe('Accept');
          expect(serverFnResponse.headers.get('x-middleware-order')).toBeNull();
          expect(serverFnResponse.headers.get('x-global-middleware')).toBe('true');
          expect(events).toEqual([]);
          expect(decodeAction).not.toHaveBeenCalled();
          expect(decodeReply).toHaveBeenCalledTimes(2);

          const apiResponse = yield* Effect.promise(() =>
            handler(new Request('http://effective-rsc.test/api/health')),
          );
          expect(yield* Effect.promise(() => apiResponse.text())).toBe('healthy');
          expect(apiResponse.headers.get('x-global-middleware')).toBe('true');
          expect(apiResponse.headers.get('x-middleware-order')).toBeNull();
          expect(apiResponse.headers.get('cache-control')).toBeNull();
          expect(apiResponse.headers.get('vary')).toBeNull();
          expect(events).toEqual(['api']);

          const missingResponse = yield* Effect.promise(() =>
            handler(new Request('http://effective-rsc.test/missing')),
          );
          expect(missingResponse.status).toBe(404);
          expect(missingResponse.headers.get('x-global-middleware')).toBe('true');
          expect(globalRequests).toBe(11);
          expect(acquisitions).toBe(1);
        }),
      ({ dispose }) => Effect.promise(dispose),
    );
  });
});
