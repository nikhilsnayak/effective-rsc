import * as BunHttpServer from '@effect/platform-bun/BunHttpServer';
import { Effect, Layer, Option, Stream, type Types } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import {
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';

import { type ApplicationDefinition, getApplicationState } from '../application/definition';
import { getERSCIdentity } from '../application/ersc-identity';
import {
  applyMiddleware,
  type AnyMiddleware,
  getScopedHttpMiddleware,
} from '../application/middleware';
import type { PagePathParams } from '../application/page';
import type { CompiledDestination } from '../application/route-graph';
import { FrameworkAssetNamespace, isAbsolutePath } from '../application/route-path';
import { FlightMediaType } from '../rsc/flight';
import { renderRouteTree } from '../rsc/render-route-tree';
import { FlightRenderer } from './flight-renderer';
import { HtmlRenderError, HtmlRenderer } from './html-renderer';
import type { RequestOutcome } from './request-outcome';
import { ApplicationIdleTimeoutSeconds, ServerConfig } from './server-config';
import {
  prepareServerFnRequest,
  type PreparedServerFnRequest,
  type ServerFnRequestFailure,
} from './server-fn-request';

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

const PublicAssetsLayer = Layer.unwrap(
  Effect.map(ServerConfig, ({ publicAssetsRoot }) =>
    HttpStaticServer.layer({
      cacheControl: 'public, max-age=0',
      root: publicAssetsRoot,
    }),
  ),
);

// Bun derives `development` from NODE_ENV, which `ersc start` does not set, and its error page
// carries the failure message and source stack.
const BunServerLayer = Layer.unwrap(
  Effect.map(ServerConfig, ({ hostname, port }) =>
    BunHttpServer.layer({
      development: false,
      hostname,
      idleTimeout: ApplicationIdleTimeoutSeconds,
      port,
    }),
  ),
);

const EmptyPathParams: PagePathParams = Object.freeze({});
const DynamicResponseHeaders = {
  'cache-control': 'private, no-store',
} as const;

const appendAcceptVary = (vary: string | undefined) => {
  if (vary === undefined || vary.trim() === '') {
    return 'Accept';
  }

  const fields = vary.split(',').map((field) => field.trim().toLowerCase());
  return fields.includes('*') || fields.includes('accept') ? vary : `${vary}, Accept`;
};

const acceptVaryPreResponseHandler: HttpEffect.PreResponseHandler = (_request, response) =>
  Effect.succeed(
    HttpServerResponse.setHeader(response, 'vary', appendAcceptVary(response.headers['vary'])),
  );

type RenderOptions<Services> = RequestOutcome & {
  readonly destination: CompiledDestination<Services>;
  readonly middleware: ReadonlyArray<AnyMiddleware<Services>>;
  readonly request: HttpServerRequest.HttpServerRequest;
};

const fromWebStream = (
  stream: ReadableStream<Uint8Array>,
  options?: { readonly releaseLockOnEnd?: boolean },
) =>
  Stream.fromReadableStream({
    evaluate: () => stream,
    onError: (cause) => cause,
    releaseLockOnEnd: options?.releaseLockOnEnd,
  });

const combinePageMiddleware = <Services>(
  middleware: ReadonlyArray<AnyMiddleware<Services>>,
  last: AnyMiddleware<Services>,
) =>
  middleware
    .slice(0, -1)
    .reduceRight(
      (combined, current) => combined.combine(getScopedHttpMiddleware(current)),
      getScopedHttpMiddleware(last),
    );

type HttpApplicationRequirements =
  | ServerConfig
  | Layer.Services<ReturnType<typeof HttpStaticServer.layer>>
  | HttpRouter.Request.From<'Error', HtmlRenderError | ServerFnRequestFailure>;

export type HttpApplicationLayer<ApplicationError> = Layer.Layer<
  never,
  ApplicationError | PlatformError,
  HttpApplicationRequirements
>;

export type ServerApplicationLayer<ApplicationError> = Layer.Layer<
  never,
  ApplicationError | PlatformError,
  ServerConfig
>;

const httpLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
): HttpApplicationLayer<ApplicationError> => {
  const applicationState = getApplicationState(application);
  const identity = getERSCIdentity(application);
  const render = Effect.fnUntraced(function* ({
    destination,
    formState,
    middleware,
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

    const pathParams = yield* destination.page.paramsSchema === null
      ? Effect.succeed(EmptyPathParams)
      : HttpRouter.params;
    const routeTree = renderRouteTree({
      destination,
      pathParams,
      pathname: requestUrl.value.pathname,
    });
    const flightRenderer = yield* FlightRenderer;
    const flight = yield* flightRenderer.render({
      formState,
      middleware,
      renderRuntime: identity.renderRuntime,
      routeTree,
      serverFnResult,
      temporaryReferences,
    });

    if (request.headers['accept'] === FlightMediaType) {
      return HttpServerResponse.stream(
        fromWebStream(flight.stream, { releaseLockOnEnd: true }).pipe(
          Stream.ensuring(flight.release),
        ),
        {
          contentType: `${FlightMediaType};charset=utf-8`,
          headers: {
            ...DynamicResponseHeaders,
            'content-location': requestUrl.value.href,
          },
          status,
        },
      );
    }

    const htmlRenderer = yield* HtmlRenderer;
    const htmlStream = yield* htmlRenderer
      .render({ flight, formState })
      .pipe(Effect.onError(() => flight.release));

    return HttpServerResponse.stream(
      fromWebStream(htmlStream).pipe(Stream.ensuring(flight.release)),
      {
        contentType: 'text/html;charset=utf-8',
        headers: DynamicResponseHeaders,
        status,
      },
    );
  });

  const executeServerFnAndRefresh = (
    prepared: PreparedServerFnRequest<Services>,
    destination: CompiledDestination<Services>,
    request: HttpServerRequest.HttpServerRequest,
  ) => {
    const refreshMiddleware = destination.middleware.filter(
      (middleware) => !prepared.middleware.includes(middleware),
    );
    const renderMiddleware =
      refreshMiddleware.length === 0
        ? prepared.middleware
        : Object.freeze([...prepared.middleware, ...refreshMiddleware]);
    const response = prepared.execute.pipe(
      Effect.flatMap((outcome) => {
        const refresh = render({
          ...outcome,
          destination,
          middleware: renderMiddleware,
          request,
        });
        return applyMiddleware(refreshMiddleware, refresh);
      }),
    );

    return applyMiddleware(prepared.middleware, response);
  };

  const RequestLayer = Layer.mergeAll(RenderersLayer, applicationState.layer);
  const ApplicationRoutesLayer = Layer.unwrap(
    Effect.map(Effect.context<Services | FlightRenderer | HtmlRenderer>(), (requestContext) => {
      const RequestContextMiddleware = HttpRouter.middleware<{
        provides: Services | FlightRenderer | HtmlRenderer;
      }>()((httpEffect): Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled> =>
        httpEffect.pipe(Effect.provideContext(requestContext)),
      );
      const makeRouteLayer = (destination: CompiledDestination<Services>) => {
        const GetLayer = HttpRouter.add('GET', destination.pattern, (request) =>
          render({
            destination,
            formState: null,
            middleware: destination.middleware,
            request,
            serverFnResult: null,
            status: 200,
          }).pipe(HttpEffect.withPreResponseHandler(acceptVaryPreResponseHandler)),
        );
        const lastPageMiddleware = destination.middleware.at(-1);
        const PageMiddleware =
          lastPageMiddleware === undefined
            ? RequestContextMiddleware
            : combinePageMiddleware(destination.middleware, lastPageMiddleware).combine(
                RequestContextMiddleware,
              );
        const PageLayer = GetLayer.pipe(Layer.provide(PageMiddleware.layer));
        const ServerFnLayer = HttpRouter.add('POST', destination.pattern, (request) =>
          prepareServerFnRequest(request, identity).pipe(
            Effect.flatMap((prepared) => executeServerFnAndRefresh(prepared, destination, request)),
            Effect.catchTag('ServerFnRequestError', (error) =>
              Effect.succeed(
                HttpServerResponse.text(error.message, {
                  headers: DynamicResponseHeaders,
                  status: error.status,
                }),
              ),
            ),
            HttpEffect.withPreResponseHandler(acceptVaryPreResponseHandler),
          ),
        ).pipe(Layer.provide(RequestContextMiddleware.layer));

        return Layer.mergeAll(PageLayer, ServerFnLayer);
      };
      const [firstDestination, ...remainingDestinations] = applicationState.routes;
      return Layer.mergeAll(
        makeRouteLayer(firstDestination),
        ...remainingDestinations.map(makeRouteLayer),
      );
    }),
  ).pipe(Layer.provide(RequestLayer));

  return Layer.mergeAll(StaticAssetsLayer, PublicAssetsLayer).pipe(
    Layer.provideMerge(ApplicationRoutesLayer),
  );
};

const serverLayer = <Services, ApplicationError>(
  application: ApplicationDefinition<Services, ApplicationError>,
): ServerApplicationLayer<ApplicationError> =>
  HttpRouter.serve(httpLayer(application)).pipe(Layer.provide(BunServerLayer));

export const ServerApplication = { httpLayer, serverLayer };
