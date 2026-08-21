import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Stream } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';

import type { ApplicationDefinition } from '../application/definition';
import type { FlightPayload } from '../rsc/flight';
import { FlightRenderer } from './flight';
import { HtmlRenderer } from './html-renderer';
import { ServerConfig } from './server-config';
import { HtmlRendererLayer } from './ssr';

const FlightMediaType = 'text/x-component';

const RenderersLayer = Layer.mergeAll(FlightRenderer.layer, HtmlRendererLayer);

const StaticAssetsLayer = Layer.unwrap(
  Effect.map(ServerConfig, ({ clientAssetsRoot }) =>
    HttpStaticServer.layer({
      cacheControl: 'no-store',
      prefix: '/assets',
      root: clientAssetsRoot,
    }),
  ),
);

const BunServerLayer = Layer.unwrap(
  Effect.map(ServerConfig, ({ hostname, port }) =>
    BunHttpServer.layer({
      hostname,
      port,
    }),
  ),
);

const fromWebStream = (stream: ReadableStream<Uint8Array>) =>
  Stream.fromReadableStream({
    evaluate: () => stream,
    onError: (cause) => cause,
  });

const httpLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => {
  const render = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
    const formState: FlightPayload['formState'] = null;
    const flightRenderer = yield* FlightRenderer;
    const flightStream = yield* flightRenderer.render({
      component: application.component,
      formState,
    });

    if (request.headers['accept']?.includes(FlightMediaType)) {
      return HttpServerResponse.stream(fromWebStream(flightStream), {
        contentType: `${FlightMediaType};charset=utf-8`,
      });
    }

    const htmlRenderer = yield* HtmlRenderer;
    const htmlStream = yield* htmlRenderer.render({ flightStream, formState });

    return HttpServerResponse.stream(fromWebStream(htmlStream), {
      contentType: 'text/html;charset=utf-8',
    });
  });

  const RequestLayer = Layer.mergeAll(RenderersLayer, application.servicesLayer);

  return Layer.mergeAll(HttpRouter.add('GET', '/', render), StaticAssetsLayer).pipe(
    HttpRouter.provideRequest(RequestLayer),
  );
};

const layer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => HttpRouter.serve(httpLayer(application)).pipe(Layer.provide(BunServerLayer));

export const Application = { httpLayer, layer } as const;
