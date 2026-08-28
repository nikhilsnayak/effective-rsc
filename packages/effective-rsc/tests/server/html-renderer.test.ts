import { describe, expect, it, vi } from '@effect/vitest';
import { Effect, Logger } from 'effect';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import type { ReactFormState } from 'react-dom/client';
import type { RenderToReadableStreamOptions } from 'react-dom/server';

import type { FlightPayload } from '../../src/rsc/flight';
import { ServerConfig } from '../../src/server/server-config';

const formState = Symbol('formState') as unknown as ReactFormState;
const clientBootstrapScripts = ['/_ersc/assets/runtime.js', '/_ersc/assets/main.js'];
let renderOptions: RenderToReadableStreamOptions | undefined;
let renderedRoot: ReactNode;

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

vi.doMock('react-server-dom-rspack/client', () => ({
  createFromReadableStream: decodeFlight,
}));
vi.doMock('react-dom/server.bun', () => ({
  renderToReadableStream: renderDocument,
}));
vi.doMock('rsc-html-stream/server', () => ({
  injectRSCPayload: () => new TransformStream<Uint8Array, Uint8Array>(),
}));

const { HtmlRenderer } = await import('../../src/server/html-renderer');

describe('HtmlRenderer', () => {
  it.effect('passes the request form state to Fizz without eagerly decoding Flight', () => {
    const logs: Array<unknown> = [];
    const logger = Logger.make<unknown, void>(({ message }) => {
      logs.push(message);
    });

    return Effect.gen(function* () {
      const renderer = yield* HtmlRenderer;
      const flightStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      yield* renderer.render({ flightStream, formState });

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
      const renderError = new Error('render failed');
      renderOptions?.onError?.(renderError, { componentStack: '\n    at Page' });
      yield* Effect.yieldNow;
      expect(logs).toEqual([['HTML render failed.', renderError, '\n    at Page']]);
    }).pipe(
      Effect.withLogger(logger),
      Effect.provide(HtmlRenderer.layer),
      Effect.provideService(
        ServerConfig,
        ServerConfig.of({
          clientAssetsRoot: '/tmp/ersc-client',
          clientBootstrapScripts,
          clientStylesheets: ['/_ersc/assets/main.css'],
          hostname: 'localhost',
          port: 18193,
          publicAssetsRoot: '/tmp/ersc-public',
        }),
      ),
    );
  });
});
