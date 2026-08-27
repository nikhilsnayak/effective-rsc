import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import { Effect, Layer, Option, Stream, type Types } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';

import { type ApplicationDefinition, getApplicationState } from '../application/definition';
import { getERSCIdentity } from '../application/ersc-identity';
import type { PagePathParams } from '../application/page';
import type { CompiledDestination } from '../application/route-graph';
import { FrameworkAssetNamespace, isAbsolutePath } from '../application/route-path';
import { getRoutesMiddlewareState } from '../application/routes-middleware';
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

const routeMiddlewareLayer = <Services>(destination: CompiledDestination<Services>) => {
  const last = destination.middleware.at(-1);
  if (last === undefined) {
    throw new TypeError('Expected a Page middleware chain to be non-empty.');
  }

  let middleware = getRoutesMiddlewareState(last).httpMiddleware;
  for (let index = destination.middleware.length - 2; index >= 0; index--) {
    const current = destination.middleware[index];
    if (current !== undefined) {
      middleware = middleware.combine(getRoutesMiddlewareState(current).httpMiddleware);
    }
  }
  return middleware;
};

const httpLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => {
  const applicationState = getApplicationState(application);
  const identity = getERSCIdentity(application);
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
      requestRuntime: identity.requestRuntime,
      routeTree,
      serverFnResult,
      temporaryReferences,
    });

    if (request.headers['accept']?.includes(FlightMediaType)) {
      return HttpServerResponse.stream(fromWebStream(flightStream), {
        contentType: `${FlightMediaType};charset=utf-8`,
        headers: { 'content-location': requestUrl.value.href },
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

  const RequestLayer = Layer.mergeAll(RenderersLayer, applicationState.layer);
  const ApplicationRoutesLayer = Layer.unwrap(
    Effect.map(Effect.context<Services | FlightRenderer | HtmlRenderer>(), (requestContext) => {
      const RequestContextMiddleware = HttpRouter.middleware<{
        provides: Services | FlightRenderer | HtmlRenderer;
      }>()((httpEffect): Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled> =>
        httpEffect.pipe(Effect.provideContext(requestContext)),
      );
      const routeLayers = applicationState.routes.flatMap((destination) => {
        const GetLayer = HttpRouter.add('GET', destination.pattern, (request) =>
          render({
            destination,
            formState: null,
            request,
            serverFnResult: null,
            status: 200,
          }),
        );
        const PageMiddleware =
          destination.middleware.length === 0
            ? RequestContextMiddleware
            : routeMiddlewareLayer(destination).combine(RequestContextMiddleware);
        const pageMiddlewareLayer = PageMiddleware.layer;
        if (typeof pageMiddlewareLayer === 'string') {
          throw new TypeError('Expected application services to satisfy Page middleware.');
        }
        const PageLayer = GetLayer.pipe(Layer.provide(pageMiddlewareLayer));
        const ServerFnLayer = HttpRouter.add('POST', destination.pattern, (request) =>
          handleServerFnRequest(request, identity).pipe(
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
        ).pipe(Layer.provide(RequestContextMiddleware.layer));

        return [PageLayer, ServerFnLayer];
      });
      const [FirstRouteLayer, ...RemainingRouteLayers] = routeLayers;
      if (FirstRouteLayer === undefined) {
        throw new TypeError('Expected the compiled application to contain a Page route.');
      }
      return Layer.mergeAll(FirstRouteLayer, ...RemainingRouteLayers);
    }),
  ).pipe(Layer.provide(RequestLayer));

  return Layer.mergeAll(ApplicationRoutesLayer, StaticAssetsLayer);
};

const serverLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
) => HttpRouter.serve(httpLayer(application)).pipe(Layer.provide(BunServerLayer));

export const ServerApplication = { httpLayer, serverLayer };
