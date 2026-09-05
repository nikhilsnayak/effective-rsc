import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunHttpPlatform from '@effect/platform-bun/BunHttpPlatform';
import * as BunPath from '@effect/platform-bun/BunPath';
import { describe, expect, it, vi } from '@effect/vitest';
import { Context, Deferred, Effect, Fiber, Layer, Schema, SchemaTransformation } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import { isValidElement } from 'react';

import { Application } from '../../src/application/ersc';
import type { PageComponent, PageRuntimeProps } from '../../src/application/page';
import { type FlightPayload, FlightMediaType, ServerFnIdHeader } from '../../src/rsc/flight';
import { ServerConfig } from '../../src/server/server-config';

let action: () => Promise<string>;
const renderFlight = vi.fn((payload: FlightPayload) => {
  let leaf = payload.routeTree;
  while (leaf.child !== null) {
    leaf = leaf.child;
  }
  if (!isValidElement<PageRuntimeProps>(leaf.content)) {
    throw new TypeError('Expected the Page element.');
  }
  const Page = leaf.content.type as PageComponent;
  const rendered = Page(leaf.content.props);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      return rendered
        .then(
          (value) => value,
          () => 'render-error',
        )
        .then((page) => {
          controller.enqueue(
            new TextEncoder().encode(JSON.stringify({ page, result: payload.serverFnResult })),
          );
          controller.close();
        });
    },
  });
});

vi.doMock('react-server-dom-rspack/server.node', () => ({
  createTemporaryReferenceSet: () => ({}),
  decodeAction: () => Promise.resolve(action),
  decodeFormState: () => Promise.resolve(null),
  decodeReply: () => Promise.resolve([]),
  loadServerAction: () => action,
  renderToReadableStream: renderFlight,
}));

const { ServerApplication } = await import('../../src/server/application');

class DecoderService extends Context.Service<
  DecoderService,
  {
    readonly decode: (value: string) => Effect.Effect<string>;
  }
>()('ersc/tests/server/page-params/DecoderService') {}

class RenderFailure extends Schema.TaggedError<RenderFailure>()('RenderFailure', {}) {}

const withHarness = <A, E, R>(
  decode: (value: string) => Effect.Effect<string>,
  use: (call: (request: Request) => Effect.Effect<Response>) => Effect.Effect<A, E, R>,
) => {
  renderFlight.mockClear();
  const ERSC = Application.ersc();
  const Middleware = ERSC.Middleware.make<{ provides: DecoderService }>((httpEffect) =>
    httpEffect.pipe(
      Effect.provideService(DecoderService, { decode }),
      Effect.map(HttpServerResponse.setHeader('x-page-middleware', 'applied')),
    ),
  );
  const Scoped = ERSC.withMiddleware(Middleware);
  const Page = Scoped.Page.make({
    params: Schema.Struct({ slug: Schema.Literals(['valid', 'render-error', 'wait']) }).pipe(
      Schema.decodeTo(
        Schema.Struct({ id: Schema.String }),
        SchemaTransformation.transformOrFail({
          decode: ({ slug }) =>
            Effect.flatMap(DecoderService, (service) =>
              Effect.map(service.decode(slug), (id) => ({ id })),
            ),
          encode: (): Effect.Effect<{ slug: 'valid' | 'render-error' | 'wait' }> =>
            Effect.succeed({ slug: 'valid' }),
        }),
      ),
    ),
    render: ({ params }) =>
      params.id === 'render-error' ? Effect.fail(new RenderFailure()) : Effect.succeed(params.id),
  });
  action = ERSC.ServerFn.make({ input: [], handler: () => Effect.succeed('action-completed') });
  const RootLayout = ERSC.Layout.make({ render: ({ children }) => Effect.succeed(children) });
  const Loading = ERSC.Loading.make({ render: () => <p>Loading</p> });
  const app = ERSC.make({
    routes: Scoped.Routes.make({ layout: RootLayout, loading: Loading }).page(
      '/params/:slug',
      Page,
    ),
  });
  const config = Layer.succeed(
    ServerConfig,
    ServerConfig.of({
      clientAssetsCacheControl: 'no-store',
      clientAssetsRoot: '/tmp/ersc-test-assets',
      clientBootstrapScripts: ['/_ersc/assets/main.js'],
      clientStylesheets: [],
      hostname: 'localhost',
      port: 18193,
      publicAssetsRoot: '/tmp/ersc-test-public-assets',
    }),
  );
  const layer = ServerApplication.httpLayer(app).pipe(
    Layer.provide(config),
    Layer.provide(Layer.mergeAll(BunFileSystem.layer, BunHttpPlatform.layer, BunPath.layer)),
  );
  return Effect.acquireUseRelease(
    Effect.sync(() => HttpRouter.toWebHandler(layer, { disableLogger: true })),
    ({ handler }) => use((request) => Effect.promise(() => handler(request))),
    ({ dispose }) => Effect.promise(dispose),
  );
};

const request = (slug: string, method: 'GET' | 'HEAD' | 'POST', accept: string) =>
  new Request(`http://effective-rsc.test/params/${slug}`, {
    method,
    headers: {
      accept,
      host: 'effective-rsc.test',
      origin: 'http://effective-rsc.test',
      [ServerFnIdHeader]: 'action',
    },
  });

describe('Page parameter request boundary', () => {
  it.effect(
    'rejects invalid GET/HEAD captures before any renderer starts, including beneath Loading',
    () =>
      withHarness(Effect.succeed, (call) =>
        Effect.gen(function* () {
          for (const method of ['GET', 'HEAD'] as const) {
            for (const accept of ['text/html', FlightMediaType]) {
              const response = yield* call(request('invalid', method, accept));
              expect(response.status).toBe(404);
              const body = yield* Effect.promise(() => response.text());
              expect(body).toBe('');
              expect(response.headers.get('vary')).toBe('Accept');
              expect(response.headers.get('cache-control')).toBe('private, no-store');
              expect(response.headers.get('x-page-middleware')).toBe('applied');
            }
          }
          expect(renderFlight).not.toHaveBeenCalled();
        }),
      ),
  );

  it.effect('decodes once with middleware services and passes transformed params to render', () => {
    let decodes = 0;
    return withHarness(
      (value) =>
        Effect.sync(() => {
          decodes += 1;
          return `${value}-decoded`;
        }),
      (call) =>
        Effect.gen(function* () {
          const response = yield* call(request('valid', 'GET', FlightMediaType));
          expect(response.status).toBe(200);
          const body = yield* Effect.promise(() => response.json());
          expect(body).toEqual({
            page: 'valid-decoded',
            result: null,
          });
          expect(decodes).toBe(1);
        }),
    );
  });

  it.effect('does not turn a decoder defect into a not-found response', () =>
    withHarness(
      () => Effect.die(new Error('Decoder service unavailable')),
      (call) =>
        Effect.gen(function* () {
          const response = yield* call(request('valid', 'GET', FlightMediaType));
          expect(response.status).toBe(500);
          expect(renderFlight).not.toHaveBeenCalled();
        }),
    ),
  );

  it.effect('leaves application render failures in Flight', () =>
    withHarness(Effect.succeed, (call) =>
      Effect.gen(function* () {
        const response = yield* call(request('render-error', 'GET', FlightMediaType));
        expect(response.status).toBe(200);
        const body = yield* Effect.promise(() => response.json());
        expect(body).toEqual({
          page: 'render-error',
          result: null,
        });
      }),
    ),
  );

  it.effect('preserves a completed POST action when refresh parameters are invalid', () =>
    withHarness(Effect.succeed, (call) =>
      Effect.gen(function* () {
        const response = yield* call(request('invalid', 'POST', FlightMediaType));
        expect(response.status).toBe(200);
        const body = yield* Effect.promise(() => response.json());
        expect(body).toEqual({
          page: 'render-error',
          result: { _tag: 'Success', value: 'action-completed' },
        });
      }),
    ),
  );

  it.effect('interrupts parameter decoding when the request is aborted', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Deferred.make<void>();
      yield* withHarness(
        () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
          ),
        (call) =>
          Effect.gen(function* () {
            const pending = yield* Effect.gen(function* () {
              const signal = yield* Effect.abortSignal;
              return yield* call(new Request(request('wait', 'GET', FlightMediaType), { signal }));
            }).pipe(Effect.scoped, Effect.forkScoped);
            yield* Deferred.await(started);
            yield* Effect.yieldNow;
            yield* Fiber.interrupt(pending);
            yield* Deferred.await(interrupted);
            expect(renderFlight).not.toHaveBeenCalled();
          }),
      );
    }),
  );
});
