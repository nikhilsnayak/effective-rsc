import { beforeEach, describe, expect, it, vi } from '@effect/vitest';
import { Effect, Exit, Logger, Scope } from 'effect';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import type { ReactFormState } from 'react-dom/client';
import type { RenderToReadableStreamOptions } from 'react-dom/server';

import type { FlightPayload } from '../../src/rsc/flight';
import type { FlightRender } from '../../src/server/flight-renderer';
import { ServerConfig } from '../../src/server/server-config';

const formState = Symbol('formState') as unknown as ReactFormState;
const clientBootstrapScripts = ['/_ersc/assets/runtime.js', '/_ersc/assets/main.js'];
const serverConfig = ServerConfig.of({
  clientAssetsRoot: '/tmp/ersc-client',
  clientBootstrapScripts,
  clientStylesheets: ['/_ersc/assets/main.css'],
  hostname: 'localhost',
  port: 18193,
  publicAssetsRoot: '/tmp/ersc-public',
});
let renderOptions: RenderToReadableStreamOptions | undefined;
let renderedRoot: ReactNode;

const makeFlightRender = (
  signal: AbortSignal,
  stream = new ReadableStream<Uint8Array>(),
): FlightRender => ({ release: Effect.void, signal, stream });

const decodeFlight = vi.fn((_stream: ReadableStream<Uint8Array>) =>
  Promise.resolve({
    formState: null,
    routeTree: {
      child: null,
      content: null,
      id: 'root',
    },
    serverFnResult: null,
  } satisfies FlightPayload),
);
const renderDocument = vi.fn((root: ReactNode, options?: RenderToReadableStreamOptions) => {
  renderedRoot = root;
  renderOptions = options;
  return Promise.resolve(new ReadableStream<Uint8Array>());
});
const injectPayload = vi.fn(() => new TransformStream<Uint8Array, Uint8Array>());

vi.doMock('react-server-dom-rspack/client', () => ({
  createFromReadableStream: decodeFlight,
}));
vi.doMock('react-dom/server.bun', () => ({
  renderToReadableStream: renderDocument,
}));
vi.doMock('rsc-html-stream/server', () => ({
  injectRSCPayload: injectPayload,
}));

const { HtmlRenderError, HtmlRenderer } = await import('../../src/server/html-renderer');

beforeEach(() => {
  decodeFlight.mockClear();
  injectPayload.mockClear();
  renderDocument.mockClear();
  renderedRoot = undefined;
  renderOptions = undefined;
});

describe('HtmlRenderer', () => {
  it.effect('passes the request form state to Fizz without eagerly decoding Flight', () => {
    const logs: Array<unknown> = [];
    const logged = Promise.withResolvers<void>();
    const logger = Logger.make<unknown, void>(({ message }) => {
      logs.push(message);
      logged.resolve();
    });

    return Effect.gen(function* () {
      const renderer = yield* HtmlRenderer;
      const flightSignal = yield* Effect.abortSignal;
      const flightStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      yield* renderer.render({
        flight: makeFlightRender(flightSignal, flightStream),
        formState,
      });

      expect(decodeFlight).not.toHaveBeenCalled();
      expect(renderDocument).toHaveBeenCalledTimes(1);
      expect(isValidElement<{ children: ReactNode }>(renderedRoot)).toBe(true);
      if (!isValidElement<{ children: ReactNode }>(renderedRoot)) {
        return;
      }

      expect(renderedRoot.type).toBe(Fragment);
      const resources = Children.toArray(renderedRoot.props.children);
      expect(resources[0]).toMatchObject({
        props: {
          href: '/_ersc/assets/main.css',
          precedence: 'default',
          rel: 'stylesheet',
        },
        type: 'link',
      });
      expect(renderOptions?.bootstrapScripts).toEqual(clientBootstrapScripts);
      expect(renderOptions?.formState).toBe(formState);
      expect(injectPayload).toHaveBeenCalledWith(expect.any(ReadableStream));
      const renderError = new Error('render failed');
      renderOptions?.onError?.(renderError, { componentStack: '\n    at Page' });
      yield* Effect.promise(() => logged.promise);
      expect(logs).toEqual([['HTML render failed.', renderError, '\n    at Page']]);
    }).pipe(
      Effect.withLogger(logger),
      Effect.provide(HtmlRenderer.layer),
      Effect.provideService(ServerConfig, serverConfig),
    );
  });

  it.effect('maps a pre-shell Fizz rejection to HtmlRenderError', () => {
    const shellFailure = new Error('shell failed');
    renderDocument.mockRejectedValueOnce(shellFailure);

    return Effect.gen(function* () {
      const renderer = yield* HtmlRenderer;
      const flightSignal = yield* Effect.abortSignal;
      const error = yield* renderer
        .render({
          flight: makeFlightRender(flightSignal),
          formState: null,
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(HtmlRenderError);
      expect(error.cause).toBe(shellFailure);
      expect(injectPayload).not.toHaveBeenCalled();
    }).pipe(Effect.provide(HtmlRenderer.layer), Effect.provideService(ServerConfig, serverConfig));
  });

  it.effect('does not log an expected render error after its request scope aborts', () => {
    const logs: Array<unknown> = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      logs.push(message);
    });

    return Effect.gen(function* () {
      const renderer = yield* HtmlRenderer;
      const flightSignal = yield* Effect.abortSignal;
      const scope = yield* Scope.make();
      yield* renderer
        .render({
          flight: makeFlightRender(flightSignal),
          formState: null,
        })
        .pipe(Scope.provide(scope));
      const onError = renderOptions?.onError;

      yield* Scope.close(scope, Exit.void);
      onError?.(new Error('request aborted'), { componentStack: '\n    at Page' });

      expect(logs).toEqual([]);
    }).pipe(
      Effect.withLogger(logger),
      Effect.provide(HtmlRenderer.layer),
      Effect.provideService(ServerConfig, serverConfig),
    );
  });

  it.effect('does not log an expected error from an aborted Flight render', () => {
    const logs: Array<unknown> = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      logs.push(message);
    });

    return Effect.gen(function* () {
      const renderer = yield* HtmlRenderer;
      const flightScope = yield* Scope.make();
      const flightSignal = yield* Effect.abortSignal.pipe(Scope.provide(flightScope));
      yield* renderer.render({
        flight: makeFlightRender(flightSignal),
        formState: null,
      });

      yield* Scope.close(flightScope, Exit.void);
      renderOptions?.onError?.(flightSignal.reason, {
        componentStack: '\n    at SuspendedPage',
      });

      expect(logs).toEqual([]);
    }).pipe(
      Effect.withLogger(logger),
      Effect.provide(HtmlRenderer.layer),
      Effect.provideService(ServerConfig, serverConfig),
    );
  });
});
