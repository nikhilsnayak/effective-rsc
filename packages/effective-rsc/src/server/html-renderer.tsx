import { Context, Effect, FiberSet, Layer, Schema, type Scope } from 'effect';
import { use } from 'react';
import { renderToReadableStream } from 'react-dom/server.bun';
import { createFromReadableStream } from 'react-server-dom-rspack/client';
import { injectRSCPayload } from 'rsc-html-stream/server';

import { RouteTree } from '../client/route-tree';
import type { FlightPayload } from '../rsc/flight';
import { ServerConfig } from './server-config';

type FlightStream = ReadableStream<Uint8Array>;
type HtmlStream = ReadableStream<Uint8Array>;

export class HtmlRenderError extends Schema.TaggedError<HtmlRenderError>()('HtmlRenderError', {
  cause: Schema.Defect(),
}) {}

export class HtmlRenderer extends Context.Service<HtmlRenderer>()(
  'ersc/server/html-renderer/HtmlRenderer',
  {
    make: Effect.gen(function* () {
      const { clientBootstrapScripts, clientStylesheets } = yield* ServerConfig;

      return {
        render: Effect.fn('HtmlRenderer.render')(function* ({
          flightStream,
          formState,
        }: {
          readonly flightStream: FlightStream;
          readonly formState: FlightPayload['formState'];
        }): Effect.fn.Return<HtmlStream, HtmlRenderError, Scope.Scope> {
          const signal = yield* Effect.abortSignal;
          const runtime = yield* FiberSet.makeRuntimePromise<never>();
          const [ssrFlightStream, browserFlightStream] = flightStream.tee();
          let payload: PromiseLike<FlightPayload> | null = null;

          function SsrRoot() {
            const { routeTree } = use(
              (payload ??= createFromReadableStream<FlightPayload>(ssrFlightStream)),
            );
            return <RouteTree root={routeTree} />;
          }

          const htmlStream = yield* Effect.tryPromise({
            try: () =>
              renderToReadableStream(
                <>
                  {clientStylesheets.map((href) => (
                    <link key={href} rel='stylesheet' href={href} precedence='default' />
                  ))}
                  <SsrRoot />
                </>,
                {
                  bootstrapScripts: [...clientBootstrapScripts],
                  formState,
                  onError: (error, errorInfo) => {
                    if (!signal.aborted) {
                      void runtime(
                        Effect.logError('HTML render failed.', error, errorInfo.componentStack),
                      );
                    }
                  },
                  signal,
                },
              ),
            catch: (cause) => new HtmlRenderError({ cause }),
          });

          return htmlStream.pipeThrough(injectRSCPayload(browserFlightStream));
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
