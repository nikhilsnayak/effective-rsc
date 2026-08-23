import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Stream } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';

import type { ApplicationDefinition } from '../application/definition';
import { FlightMediaType, type FlightPayload } from '../rsc/flight';
import { FlightRenderer } from './flight';
import { HtmlRenderer } from './html-renderer';
import { ServerConfig } from './server-config';
import { handleServerFnRequest } from './server-fn';
import { HtmlRendererLayer } from './ssr';

const RenderersLayer = Layer.mergeAll(FlightRenderer.layer, HtmlRendererLayer);

const StaticAssetsLayer = Layer.unwrap(
  Effect.map(ServerConfig, ({ clientAssetsRoot }) =>
    HttpStaticServer.layer({
      cacheControl: 'no-store',
      prefix: '/_ersc/assets',
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
  const render = Effect.fnUntraced(function* (
    request: HttpServerRequest.HttpServerRequest,
    pathname: `/${string}`,
    options: {
      readonly formState: FlightPayload['formState'];
      readonly serverFnResult: FlightPayload['serverFnResult'];
      readonly status: number;
      readonly temporaryReferences?: import('./flight').TemporaryReferenceSet;
    },
  ) {
    const flightRenderer = yield* FlightRenderer;
    const flightStream = yield* flightRenderer.render({
      component: application.component,
      formState: options.formState,
      pathname,
      serverFnResult: options.serverFnResult,
      temporaryReferences: options.temporaryReferences,
    });

    if (request.headers['accept']?.includes(FlightMediaType)) {
      return HttpServerResponse.stream(fromWebStream(flightStream), {
        contentType: `${FlightMediaType};charset=utf-8`,
        status: options.status,
      });
    }

    const htmlRenderer = yield* HtmlRenderer;
    const htmlStream = yield* htmlRenderer.render({
      flightStream,
      formState: options.formState,
    });

    return HttpServerResponse.stream(fromWebStream(htmlStream), {
      contentType: 'text/html;charset=utf-8',
      status: options.status,
    });
  });

  const RequestLayer = Layer.mergeAll(RenderersLayer, application.servicesLayer);
  const ApplicationRoutesLayer = Layer.effectDiscard(
    Effect.gen(function* () {
      const router = yield* HttpRouter.HttpRouter;

      for (const pathname of application.paths) {
        yield* router.add('GET', pathname, (request) =>
          render(request, pathname, {
            formState: null,
            serverFnResult: null,
            status: 200,
          }),
        );
        yield* router.add('POST', pathname, (request) =>
          handleServerFnRequest<Services>(request).pipe(
            Effect.flatMap((result) => render(request, pathname, result)),
            Effect.catchTag('ServerFnRequestError', (error) =>
              Effect.succeed(
                HttpServerResponse.text(error.message, {
                  status: error.status,
                }),
              ),
            ),
          ),
        );
      }
    }),
  );

  return Layer.mergeAll(ApplicationRoutesLayer, StaticAssetsLayer).pipe(
    HttpRouter.provideRequest(RequestLayer),
  );
};

const layer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => HttpRouter.serve(httpLayer(application)).pipe(Layer.provide(BunServerLayer));

export const Application = { httpLayer, layer } as const;
