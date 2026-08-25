import { Layer } from 'effect';
import { Suspense } from 'react';

import { type ERSCIdentity, ERSCIdentityTypeId } from './ersc-identity';
import { compileRouteGraph } from './route-graph';
import type { ReservedPath, StaticPath } from './route-path';
import { RouteOutlet, type RouteTreeModel } from './route-tree';
import { type AnyRoutes, type RoutesHasLayout, type RoutesPaths } from './routes';

type ApplicationComponentProps = {
  readonly pathname: StaticPath;
};

export type ApplicationRouteTreeRenderer = (props: ApplicationComponentProps) => RouteTreeModel;

export type ApplicationDefinition<Services, ApplicationError = never> = {
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly paths: ReadonlyArray<StaticPath>;
  readonly renderRouteTree: ApplicationRouteTreeRenderer;
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
      : [Extract<RoutesPaths<Definition>, ReservedPath>] extends [never]
        ? unknown
        : never
    : never;

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

const layoutNodeId = (scopeId: string) => `layout:${scopeId}`;

const loadingNodeId = (scopeId: string, pathname: StaticPath) => `loading:${scopeId}:${pathname}`;

const pageNodeId = (pathname: StaticPath) => `page:${pathname}`;

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

  const routeGraph = compileRouteGraph(routes);

  function renderRouteTree({ pathname }: ApplicationComponentProps) {
    const route = routeGraph.route(pathname);
    if (route === undefined) {
      throw new TypeError(`No static route is registered for "${pathname}".`);
    }

    const Page = route.page;
    let tree: RouteTreeModel = {
      child: null,
      content: <Page />,
      id: pageNodeId(pathname),
    };

    for (let index = route.scopes.length - 1; index >= 0; index--) {
      const scope = route.scopes[index];
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
          id: loadingNodeId(scope.id, pathname),
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
          id: layoutNodeId(scope.id),
        };
      }
    }

    return tree;
  }

  return {
    [ERSCIdentityTypeId]: identity,
    paths: routeGraph.paths,
    renderRouteTree,
    servicesLayer: resolveServicesLayer<Services, ApplicationError>(servicesLayer),
  };
};
