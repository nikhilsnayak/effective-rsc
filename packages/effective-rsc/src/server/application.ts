import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Option, Stream } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';

import { type ApplicationDefinition, getApplicationState } from '../application/definition';
import { ERSCIdentityTypeId } from '../application/ersc-identity';
import type { PagePathParams } from '../application/page';
import type { CompiledDestination } from '../application/route-graph';
import { FrameworkAssetNamespace, isAbsolutePath } from '../application/route-path';
import { FlightMediaType } from '../rsc/flight';
import { renderRouteTree } from '../rsc/render-route-tree';
import { FlightRenderer } from './flight-renderer';
import { HtmlRenderer } from './html-renderer';
import type { RequestOutcome } from './request-outcome';
import { ServerConfig } from './server-config';
import { handleServerFnRequest } from './server-fn-request';

const RenderersLayer = Layer.mergeAll(FlightRenderer.layer, HtmlRenderer.layer);

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

const EmptyPathParams: PagePathParams = Object.freeze({});

type RenderOptions<Services> = RequestOutcome & {
  readonly destination: CompiledDestination<Services>;
  readonly request: HttpServerRequest.HttpServerRequest;
};

const fromWebStream = (stream: ReadableStream<Uint8Array>) =>
  Stream.fromReadableStream({
    evaluate: () => stream,
    onError: (cause) => cause,
  });

const httpLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => {
  const applicationState = getApplicationState(application);
  const render = Effect.fnUntraced(function* ({
    destination,
    formState,
    request,
    serverFnResult,
    status,
    temporaryReferences,
  }: RenderOptions<Services>) {
    const requestUrl = HttpServerRequest.toURL(request);
    if (Option.isNone(requestUrl) || !isAbsolutePath(requestUrl.value.pathname)) {
      return yield* Effect.die(
        new TypeError(`Expected request URL "${request.originalUrl}" to contain an absolute path.`),
      );
    }

    const pathParams =
      destination.page.paramsSchema === null ? EmptyPathParams : yield* HttpRouter.params;
    const routeTree = renderRouteTree({
      destination,
      pathParams,
      pathname: requestUrl.value.pathname,
    });
    const flightRenderer = yield* FlightRenderer;
    const flightStream = yield* flightRenderer.render({
      formState,
      requestRuntime: applicationState[ERSCIdentityTypeId].requestRuntime,
      routeTree,
      serverFnResult,
      temporaryReferences,
    });

    if (request.headers['accept']?.includes(FlightMediaType)) {
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

  const RequestLayer = Layer.mergeAll(RenderersLayer, applicationState.servicesLayer);
  const ApplicationRoutesLayer = HttpRouter.addAll(
    applicationState.routes.flatMap((destination) => [
      HttpRouter.route('GET', destination.pattern, (request) =>
        render({
          destination,
          formState: null,
          request,
          serverFnResult: null,
          status: 200,
        }),
      ),
      HttpRouter.route('POST', destination.pattern, (request) =>
        handleServerFnRequest(request, applicationState[ERSCIdentityTypeId]).pipe(
          Effect.flatMap((result) =>
            render({
              ...result,
              destination,
              request,
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
      ),
    ]),
  );

  return Layer.mergeAll(ApplicationRoutesLayer, StaticAssetsLayer).pipe(
    HttpRouter.provideRequest(RequestLayer),
  );
};

const serverLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => HttpRouter.serve(httpLayer(application)).pipe(Layer.provide(BunServerLayer));

export const ServerApplication = { httpLayer, serverLayer };
