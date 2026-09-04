import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it, vi } from '@effect/vitest';
import { Context, Effect, Layer, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';

import { Application } from '../../src/application/ersc';
import { ServerFnIdHeader } from '../../src/rsc/flight';
import { ServerConfig } from '../../src/server/server-config';

const decodeAction = vi.fn((..._args: Array<unknown>): Promise<null | (() => Promise<string>)> =>
  Promise.resolve(null),
);
const decodeReply = vi.fn((..._args: Array<unknown>): Promise<ReadonlyArray<unknown>> =>
  Promise.resolve([]),
);
let scopedServerAction: ((input: string) => Promise<string>) | undefined;

vi.doMock('react-server-dom-rspack/server.node', () => ({
  createTemporaryReferenceSet: () => ({}),
  decodeAction,
  decodeFormState: () => Promise.resolve(null),
  decodeReply,
  loadServerAction: (id: string) => {
    if (id === 'scoped-action' && scopedServerAction !== undefined) {
      return scopedServerAction;
    }
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

class CurrentUser extends Context.Service<CurrentUser, { readonly name: string }>()(
  'ersc/tests/server/application/CurrentUser',
) {}

const ServerConfigLayer = Layer.succeed(
  ServerConfig,
  ServerConfig.of({
    clientAssetsCacheControl: 'no-store',
    clientAssetsRoot: '/tmp/ersc-test-assets',
    clientBootstrapScripts: ['/_ersc/assets/client.js'],
    clientStylesheets: [],
    hostname: 'localhost',
    port: 18193,
    publicAssetsRoot: '/tmp/ersc-test-public-assets',
  }),
);

const Origin = 'http://effective-rsc.test';
const ProtectedUrl = `${Origin}/protected`;
const MaximumBodyBytes = 10 * 1024 * 1024;

type Harness = {
  readonly call: (input: Request) => Effect.Effect<Response>;
  readonly counters: { acquisitions: number; globalRequests: number };
  readonly events: Array<string>;
};

const makeHttpLayer = (counters: Harness['counters'], events: Harness['events']) => {
  const ERSC = Application.ersc<RequestTrace>();
  const Outer = ERSC.Middleware.make((httpEffect) =>
    Effect.gen(function* () {
      const trace = yield* RequestTrace;
      const request = yield* HttpServerRequest.HttpServerRequest;
      trace.events.push('outer:request');
      let response: HttpServerResponse.HttpServerResponse;
      if (request.url === '/') {
        response = HttpServerResponse.text('Root Page');
      } else {
        response = yield* httpEffect;
      }
      trace.events.push('outer:response');
      const innerOrder = response.headers['x-middleware-order'];
      return HttpServerResponse.setHeader(
        response,
        'x-middleware-order',
        innerOrder === undefined ? 'outer' : `${innerOrder},outer`,
      );
    }),
  );
  const Inner = ERSC.Middleware.make(() =>
    Effect.gen(function* () {
      const trace = yield* RequestTrace;
      const request = yield* HttpServerRequest.HttpServerRequest;
      expect(request.url).toBe('/protected');
      trace.events.push('inner:request');
      const response = HttpServerResponse.text('Routes middleware response');
      trace.events.push('inner:response');
      return HttpServerResponse.setHeader(response, 'x-middleware-order', 'inner');
    }),
  );
  const OuterScope = ERSC.withMiddleware(Outer);
  const Shared = OuterScope.Middleware.make((httpEffect) =>
    Effect.gen(function* () {
      const trace = yield* RequestTrace;
      trace.events.push('shared:request');
      const response = yield* httpEffect;
      trace.events.push('shared:response');
      return response;
    }),
  );
  const InnerScope = OuterScope.withMiddleware(Shared).withMiddleware(Inner);
  const RequireUser = OuterScope.Middleware.make<{ provides: CurrentUser }>((httpEffect) =>
    Effect.gen(function* () {
      const trace = yield* RequestTrace;
      trace.events.push('auth:request');
      const response = yield* httpEffect.pipe(
        Effect.provideService(CurrentUser, { name: 'Nikhil' }),
      );
      trace.events.push('auth:response');
      return response;
    }),
  );
  const AuthenticatedScope = OuterScope.withMiddleware(RequireUser).withMiddleware(Shared);
  scopedServerAction = AuthenticatedScope.ServerFn.make({
    input: Schema.String,
    handler: Effect.fnUntraced(function* (input) {
      const trace = yield* RequestTrace;
      const user = yield* CurrentUser;
      trace.events.push(`action:${user.name}`);
      return input;
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
    // Keep application route registration observably slower than static fallbacks so route
    // precedence cannot accidentally depend on Layer acquisition timing.
    Effect.sleep('10 millis').pipe(
      Effect.andThen(
        Effect.sync(() => {
          counters.acquisitions += 1;
          return RequestTrace.of({ events });
        }),
      ),
    ),
  );
  const GlobalMiddlewareLayer = HttpRouter.middleware(
    (httpEffect) =>
      Effect.andThen(
        Effect.sync(() => {
          counters.globalRequests += 1;
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
    routes: OuterScope.Routes.make({
      layout: RootLayout,
    })
      .page('/', Page)
      .mount('/protected', InnerScope.Routes.make().page('/', Page)),
  });

  return ServerApplication.httpLayer(App).pipe(
    Layer.provide(ServerConfigLayer),
    Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunHttpPlatform.layer, BunPath.layer)),
  );
};

const withHarness = <Value, Error>(
  use: (harness: Harness) => Effect.Effect<Value, Error>,
): Effect.Effect<Value, Error> => {
  decodeAction.mockClear();
  decodeReply.mockClear();
  scopedServerAction = undefined;
  const counters = { acquisitions: 0, globalRequests: 0 };
  const events: Array<string> = [];

  return Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(makeHttpLayer(counters, events), {
        disableLogger: true,
      }),
    ),
    ({ handler }) =>
      use({ call: (input) => Effect.promise(() => handler(input)), counters, events }),
    ({ dispose }) => Effect.promise(dispose),
  );
};

type ServerFnRequestOptions = Omit<RequestInit, 'headers' | 'method'> & {
  readonly headers?: Readonly<Record<string, string>>;
};

const serverFnRequest = (id: string, { headers, ...init }: ServerFnRequestOptions = {}) =>
  new Request(ProtectedUrl, {
    ...init,
    headers: {
      host: 'effective-rsc.test',
      origin: Origin,
      [ServerFnIdHeader]: id,
      ...headers,
    },
    method: 'POST',
  });

const progressiveServerFnRequest = (body: FormData) =>
  new Request(ProtectedUrl, {
    body,
    headers: {
      host: 'effective-rsc.test',
      origin: Origin,
    },
    method: 'POST',
  });

describe('ServerApplication.httpLayer', () => {
  it.effect('prefers an application root Page over the public asset fallback', () =>
    withHarness(({ call, events }) =>
      Effect.gen(function* () {
        const response = yield* call(new Request(`${Origin}/`));
        const body = yield* Effect.promise(() => response.text());

        expect(response.status).toBe(200);
        expect(body).toBe('Root Page');
        expect(events).toEqual(['outer:request', 'outer:response']);
      }),
    ),
  );

  it.effect('runs inherited Routes middleware from ancestor to descendant around a Page GET', () =>
    withHarness(({ call, events }) =>
      Effect.gen(function* () {
        const response = yield* call(new Request(ProtectedUrl));

        const body = yield* Effect.promise(() => response.text());

        expect(response.status).toBe(200);
        expect(body).toBe('Routes middleware response');
        expect(response.headers.get('x-middleware-order')).toBe('inner,outer');
        expect(response.headers.get('x-global-middleware')).toBe('true');
        expect(events).toEqual([
          'outer:request',
          'shared:request',
          'inner:request',
          'inner:response',
          'shared:response',
          'outer:response',
        ]);
      }),
    ),
  );

  it.effect('runs the same middleware chain for the native HEAD fallback', () =>
    withHarness(({ call, events }) =>
      Effect.gen(function* () {
        const response = yield* call(new Request(ProtectedUrl, { method: 'HEAD' }));

        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-order')).toBe('inner,outer');
        expect(events).toEqual([
          'outer:request',
          'shared:request',
          'inner:request',
          'inner:response',
          'shared:response',
          'outer:response',
        ]);
      }),
    ),
  );

  it.effect('rejects a Server Function POST whose Origin does not match the request host', () =>
    withHarness(({ call }) =>
      Effect.gen(function* () {
        const missingOrigin = yield* call(
          new Request(ProtectedUrl, {
            headers: { host: 'effective-rsc.test' },
            method: 'POST',
          }),
        );
        expect(missingOrigin.status).toBe(403);

        const crossOrigin = yield* call(
          serverFnRequest('cross-origin', {
            headers: { origin: 'https://cross-origin.example' },
          }),
        );
        expect(crossOrigin.status).toBe(403);

        const wrongForwardedOrigin = yield* call(
          serverFnRequest('wrong-forwarded-origin', {
            headers: {
              host: 'internal-proxy.test',
              origin: 'https://internal-proxy.test',
              'x-forwarded-host': 'public.example, internal-proxy.test',
            },
          }),
        );
        expect(wrongForwardedOrigin.status).toBe(403);
        expect(decodeReply).not.toHaveBeenCalled();
      }),
    ),
  );

  it.effect('accepts a Server Function POST matching the first forwarded host', () =>
    withHarness(({ call }) =>
      Effect.gen(function* () {
        const response = yield* call(
          serverFnRequest('forwarded-origin', {
            headers: {
              host: 'internal-proxy.test',
              origin: 'https://public.example',
              'x-forwarded-host': 'public.example, internal-proxy.test',
            },
          }),
        );

        expect(response.status).toBe(400);
        expect(decodeReply).toHaveBeenCalledTimes(1);
      }),
    ),
  );

  it.effect('rejects Server Function bodies over the limit before React decodes them', () =>
    withHarness(({ call }) =>
      Effect.gen(function* () {
        const knownOversized = yield* call(
          serverFnRequest('known-oversized', {
            headers: { 'content-length': String(MaximumBodyBytes + 1) },
          }),
        );
        expect(knownOversized.status).toBe(413);

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
        const streamingInit: ServerFnRequestOptions & { readonly duplex: 'half' } = {
          body: streamingBody,
          duplex: 'half',
        };
        const streamingOversized = yield* call(
          serverFnRequest('streaming-oversized', streamingInit),
        );

        expect(streamingOversized.status).toBe(413);
        expect(decodeReply).not.toHaveBeenCalled();
      }),
    ),
  );

  it.effect('leaves an invalid Server Function request outside scoped middleware', () =>
    withHarness(({ call, events }) =>
      Effect.gen(function* () {
        const response = yield* call(serverFnRequest('direct-host'));

        expect(response.status).toBe(400);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('vary')).toBe('Accept');
        expect(response.headers.get('x-middleware-order')).toBeNull();
        expect(response.headers.get('x-global-middleware')).toBe('true');
        expect(events).toEqual([]);
        expect(decodeAction).not.toHaveBeenCalled();
        expect(decodeReply).toHaveBeenCalledTimes(1);
      }),
    ),
  );

  it.effect('runs shared middleware once even when the action and route scopes diverge', () =>
    withHarness(({ call, events }) =>
      Effect.gen(function* () {
        decodeReply.mockResolvedValueOnce(['hello']);

        const response = yield* call(serverFnRequest('scoped-action'));
        const body = yield* Effect.promise(() => response.text());

        expect(response.status).toBe(200);
        expect(body).toBe('Routes middleware response');
        expect(events).toEqual([
          'outer:request',
          'auth:request',
          'shared:request',
          'action:Nikhil',
          'inner:request',
          'inner:response',
          'shared:response',
          'auth:response',
          'outer:response',
        ]);
      }),
    ),
  );

  it.effect('applies the same middleware scope to a progressive Server Function', () =>
    withHarness(({ call, events }) =>
      Effect.gen(function* () {
        decodeAction.mockResolvedValueOnce(() => {
          if (scopedServerAction === undefined) {
            throw new Error('Expected the scoped Server Function to be registered.');
          }
          return scopedServerAction('progressive');
        });

        const response = yield* call(progressiveServerFnRequest(new FormData()));
        const body = yield* Effect.promise(() => response.text());

        expect(response.status).toBe(200);
        expect(body).toBe('Routes middleware response');
        expect(events).toEqual([
          'outer:request',
          'auth:request',
          'shared:request',
          'action:Nikhil',
          'inner:request',
          'inner:response',
          'shared:response',
          'auth:response',
          'outer:response',
        ]);
      }),
    ),
  );

  it.effect('leaves userland HTTP outside Routes middleware and dynamic response headers', () =>
    withHarness(({ call, events }) =>
      Effect.gen(function* () {
        const response = yield* call(new Request(`${Origin}/api/health`));

        const body = yield* Effect.promise(() => response.text());

        expect(body).toBe('healthy');
        expect(response.headers.get('x-global-middleware')).toBe('true');
        expect(response.headers.get('x-middleware-order')).toBeNull();
        expect(response.headers.get('cache-control')).toBeNull();
        expect(response.headers.get('vary')).toBeNull();
        expect(events).toEqual(['api']);
      }),
    ),
  );

  it.effect('keeps the native 404 for an unmatched path inside global middleware', () =>
    withHarness(({ call }) =>
      Effect.gen(function* () {
        const response = yield* call(new Request(`${Origin}/missing`));

        expect(response.status).toBe(404);
        expect(response.headers.get('x-global-middleware')).toBe('true');
      }),
    ),
  );

  it.effect('acquires application services once for the server rather than once per request', () =>
    withHarness(({ call, counters }) =>
      Effect.gen(function* () {
        yield* call(new Request(ProtectedUrl));
        yield* call(new Request(`${Origin}/api/health`));
        yield* call(new Request(`${Origin}/missing`));

        expect(counters.globalRequests).toBe(3);
        expect(counters.acquisitions).toBe(1);
      }),
    ),
  );
});
