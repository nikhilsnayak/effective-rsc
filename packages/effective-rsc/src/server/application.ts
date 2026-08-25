import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Stream } from 'effect';
import { HttpRouter, HttpServerResponse, HttpStaticServer } from 'effect/unstable/http';

import type { ApplicationDefinition } from '../application/definition';
import { ERSCIdentityTypeId } from '../application/ersc-identity';
import { FrameworkAssetNamespace } from '../application/route-path';
import { FlightMediaType } from '../rsc/flight';
import { FlightRendererLayer } from './flight';
import { FlightRenderer } from './flight-renderer';
import { HtmlRenderer } from './html-renderer';
import type { RequestOutcome } from './request-outcome';
import { ServerConfig } from './server-config';
import { handleServerFnRequest } from './server-fn-request';
import { HtmlRendererLayer } from './ssr';

const RenderersLayer = Layer.mergeAll(FlightRendererLayer, HtmlRendererLayer);

const StaticAssetsLayer = Layer.unwrap(
  Effect.map(ServerConfig, ({ clientAssetsRoot }) =>
    HttpStaticServer.layer({
      cacheControl: 'no-store',
      prefix: FrameworkAssetNamespace,
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

type RenderOpts = RequestOutcome & {
  readonly accept: string | undefined;
  readonly pathname: `/${string}`;
};

const fromWebStream = (stream: ReadableStream<Uint8Array>) =>
  Stream.fromReadableStream({
    evaluate: () => stream,
    onError: (cause) => cause,
  });

const httpLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => {
  const render = Effect.fnUntraced(function* ({
    accept,
    formState,
    pathname,
    serverFnResult,
    status,
    temporaryReferences,
  }: RenderOpts) {
    const flightRenderer = yield* FlightRenderer;
    const flightStream = yield* flightRenderer.render({
      renderRouteTree: application.renderRouteTree,
      formState,
      pathname,
      requestRuntime: application[ERSCIdentityTypeId].requestRuntime,
      serverFnResult,
      temporaryReferences,
    });

    if (accept?.includes(FlightMediaType)) {
      return HttpServerResponse.stream(fromWebStream(flightStream), {
        contentType: `${FlightMediaType};charset=utf-8`,
        status,
      });
    }

    const htmlRenderer = yield* HtmlRenderer;
    const htmlStream = yield* htmlRenderer.render({ flightStream, formState });

    return HttpServerResponse.stream(fromWebStream(htmlStream), {
      contentType: 'text/html;charset=utf-8',
      status,
    });
  });

  const RequestLayer = Layer.mergeAll(RenderersLayer, application.servicesLayer);
  const ApplicationRoutesLayer = Layer.effectDiscard(
    Effect.gen(function* () {
      const router = yield* HttpRouter.HttpRouter;

      for (const pathname of application.paths) {
        yield* router.add('GET', pathname, (request) =>
          render({
            accept: request.headers['accept'],
            formState: null,
            pathname,
            serverFnResult: null,
            status: 200,
          }),
        );
        yield* router.add('POST', pathname, (request) =>
          handleServerFnRequest(request, application[ERSCIdentityTypeId]).pipe(
            Effect.flatMap((result) =>
              render({
                ...result,
                accept: request.headers['accept'],
                pathname,
              }),
            ),
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
