import { Effect, Layer } from 'effect';
import { use } from 'react';
import { renderToReadableStream } from 'react-dom/server.bun';
import { createFromReadableStream } from 'react-server-dom-rspack/client';
import { injectRSCPayload } from 'rsc-html-stream/server';

import type { FlightPayload } from '../rsc/flight';
import { HtmlRenderError, HtmlRenderer } from './html-renderer';
import { ServerConfig } from './server-config';

const make = Effect.gen(function* () {
  const { clientBootstrapScripts, clientStylesheets } = yield* ServerConfig;

  return HtmlRenderer.of({
    render: Effect.fn('HtmlRenderer.render')(function* ({ flightStream, formState }) {
      const signal = yield* Effect.abortSignal;
      const [ssrFlightStream, browserFlightStream] = flightStream.tee();
      let payload: PromiseLike<FlightPayload> | undefined;

      function SsrRoot() {
        return use((payload ??= createFromReadableStream<FlightPayload>(ssrFlightStream))).root;
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
              signal,
            },
          ),
        catch: (cause) => new HtmlRenderError({ cause }),
      });

      return htmlStream.pipeThrough(injectRSCPayload(browserFlightStream));
    }),
  });
});

export const HtmlRendererLayer = Layer.effect(HtmlRenderer, make);
