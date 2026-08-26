import { Layer } from 'effect';
import { Suspense } from 'react';

import { type ERSCIdentity, ERSCIdentityTypeId } from './ersc-identity';
import { type PagePathParams } from './page';
import { type CompiledDestination, compileRouteGraph } from './route-graph';
import type { AbsolutePath, ReservedRoutePath } from './route-path';
import { RouteOutlet, type RouteTreeModel } from './route-tree';
import { type AnyRoutes, type RoutesHasLayout, type RoutesPaths } from './routes';

export type ApplicationDefinition<Services, ApplicationError = never> = {
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly routes: ReadonlyArray<CompiledDestination<Services>>;
  readonly servicesLayer: Layer.Layer<Services, ApplicationError>;
};

export type ApplicationServices<Application> =
  Application extends ApplicationDefinition<infer Services, infer _ApplicationError>
    ? Services
    : never;

type ValidRootRoutes<Services, Definition extends AnyRoutes<Services>> =
  RoutesHasLayout<Definition> extends true
    ? [RoutesPaths<Definition>] extends [never]
      ? never
      : [ReservedRoutes<RoutesPaths<Definition>>] extends [never]
        ? unknown
        : never
    : never;

type ReservedRoutes<Paths> = Paths extends AbsolutePath ? ReservedRoutePath<Paths> : never;

type ServicesLayerOptions<Services, ApplicationError> = [Services] extends [never]
  ? { readonly servicesLayer?: Layer.Layer<never, ApplicationError> }
  : { readonly servicesLayer: Layer.Layer<Services, ApplicationError> };

export type ERSCApplicationOptions<
  Services,
  Definition extends AnyRoutes<Services>,
  ApplicationError,
> = {
  readonly routes: Definition & ValidRootRoutes<Services, Definition>;
} & ServicesLayerOptions<Services, ApplicationError>;

export type ERSCMake<Services> = <Definition extends AnyRoutes<Services>, ApplicationError = never>(
  options: ERSCApplicationOptions<Services, Definition, ApplicationError>,
) => ApplicationDefinition<Services, ApplicationError>;

function resolveServicesLayer<Services, ApplicationError>(
  servicesLayer:
    | Layer.Layer<Services, ApplicationError>
    | Layer.Layer<never, ApplicationError>
    | undefined,
): Layer.Layer<Services, ApplicationError>;
function resolveServicesLayer(servicesLayer: Layer.Any | undefined): Layer.Any {
  return servicesLayer ?? Layer.empty;
}

type RenderRouteTreeOptions<Services> = {
  readonly destination: CompiledDestination<Services>;
  readonly pathname: AbsolutePath;
  readonly pathParams: PagePathParams;
};

export const renderRouteTree = <Services,>({
  destination,
  pathname,
  pathParams,
}: RenderRouteTreeOptions<Services>): RouteTreeModel => {
  const Page = destination.page.component;
  let tree: RouteTreeModel = {
    child: null,
    content: <Page params={pathParams} />,
    id: `page:${pathname}`,
  };

  for (let index = destination.scopes.length - 1; index >= 0; index--) {
    const scope = destination.scopes[index];
    if (scope === undefined) {
      continue;
    }

    if (scope.loading !== null) {
      const Loading = scope.loading;
      tree = {
        child: tree,
        content: (
          <Suspense fallback={<Loading />}>
            <RouteOutlet />
          </Suspense>
        ),
        id: `loading:${scope.id}:${pathname}`,
      };
    }

    if (scope.layout !== null) {
      const Layout = scope.layout;
      tree = {
        child: tree,
        content: (
          <Layout>
            <RouteOutlet />
          </Layout>
        ),
        id: `layout:${scope.id}`,
      };
    }
  }

  return tree;
};

export const makeApplication = <
  Services,
  Definition extends AnyRoutes<Services>,
  ApplicationError = never,
>(
  identity: ERSCIdentity<Services>,
  { routes, servicesLayer }: ERSCApplicationOptions<Services, Definition, ApplicationError>,
): ApplicationDefinition<Services, ApplicationError> => {
  if (routes[ERSCIdentityTypeId] !== identity) {
    throw new TypeError('Root Routes were created by a different ERSC module.');
  }

  return {
    [ERSCIdentityTypeId]: identity,
    routes: compileRouteGraph(routes),
    servicesLayer: resolveServicesLayer<Services, ApplicationError>(servicesLayer),
  };
};
