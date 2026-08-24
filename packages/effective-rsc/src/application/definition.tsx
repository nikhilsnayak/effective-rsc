import { Layer } from 'effect';
import { Suspense } from 'react';

import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import type { PageComponent } from './page';
import type { RenderRuntime } from './render-runtime';
import { RouteOutlet, type RouteTreeModel } from './route-tree';
import {
  type AnyRoutes,
  joinRoutePaths,
  type Present,
  type RoutesLayout,
  type RoutesPaths,
  type RoutesServices,
} from './routes';

type StaticPath = `/${string}`;
type ReservedPath = '/_ersc/assets' | `/_ersc/assets/${string}`;

type ApplicationComponentProps<Services> = {
  readonly pathname: StaticPath;
  readonly runtime: RenderRuntime<Services>;
};

export type ApplicationRouteTreeRenderer<Services> = (
  props: ApplicationComponentProps<Services>,
) => RouteTreeModel;

export type ApplicationDefinition<Services, ApplicationError = never> = {
  readonly paths: ReadonlyArray<StaticPath>;
  readonly renderRouteTree: ApplicationRouteTreeRenderer<Services>;
  readonly servicesLayer: Layer.Layer<Services, ApplicationError>;
};

export type ApplicationServices<Application> =
  Application extends ApplicationDefinition<infer Services, infer _ApplicationError>
    ? Services
    : never;

type ServicesLayerOptions<Services, ApplicationError> = [Services] extends [never]
  ? { readonly servicesLayer?: Layer.Layer<never, ApplicationError> }
  : { readonly servicesLayer: Layer.Layer<Services, ApplicationError> };

type RootRoutes<Definition extends AnyRoutes> =
  RoutesLayout<Definition> extends Present<LayoutComponent<unknown>>
    ? [RoutesPaths<Definition>] extends [never]
      ? never
      : [Extract<RoutesPaths<Definition>, ReservedPath>] extends [never]
        ? Definition
        : never
    : never;

type ApplicationOptions<Definition extends AnyRoutes, ApplicationError> = {
  readonly routes: Definition & RootRoutes<Definition>;
} & ServicesLayerOptions<RoutesServices<Definition>, ApplicationError>;

type RouteScope = {
  readonly id: StaticPath;
  readonly layout: LayoutComponent<unknown> | null;
  readonly loading: LoadingComponent | null;
};

type CompiledRoute = {
  readonly page: PageComponent<unknown>;
  readonly scopes: ReadonlyArray<RouteScope>;
};

function resolveServicesLayer<Services, ApplicationError>(
  servicesLayer:
    | Layer.Layer<Services, ApplicationError>
    | Layer.Layer<never, ApplicationError>
    | undefined,
): Layer.Layer<Services, ApplicationError>;
function resolveServicesLayer(servicesLayer: Layer.Any | undefined): Layer.Any {
  return servicesLayer ?? Layer.empty;
}

const compileRoutes = (
  routes: AnyRoutes,
  prefix: StaticPath,
  inheritedScopes: ReadonlyArray<RouteScope>,
  compiledRoutes: Map<StaticPath, CompiledRoute>,
) => {
  const scopes =
    routes.layout === null && routes.loading === null
      ? inheritedScopes
      : [
          ...inheritedScopes,
          {
            id: prefix,
            layout: routes.layout,
            loading: routes.loading,
          },
        ];

  for (const route of routes.pages) {
    const pathname = joinRoutePaths(prefix, route.path);
    if (pathname === '/_ersc/assets' || pathname.startsWith('/_ersc/assets/')) {
      throw new TypeError(
        `Static route "${pathname}" uses the framework-reserved "/_ersc/assets" namespace.`,
      );
    }
    if (compiledRoutes.has(pathname)) {
      throw new TypeError(`Static route "${pathname}" is declared more than once.`);
    }
    compiledRoutes.set(pathname, { page: route.page, scopes });
  }

  for (const mount of routes.mounts) {
    compileRoutes(mount.routes, joinRoutePaths(prefix, mount.path), scopes, compiledRoutes);
  }
};

const make = <const Definition extends AnyRoutes, ApplicationError = never>({
  routes,
  servicesLayer,
}: ApplicationOptions<Definition, ApplicationError>): ApplicationDefinition<
  RoutesServices<Definition>,
  ApplicationError
> => {
  if (routes.layout === null) {
    throw new TypeError('The root Routes passed to Application.make must define a Layout.');
  }

  const compiledRoutes = new Map<StaticPath, CompiledRoute>();
  compileRoutes(routes, '/', [], compiledRoutes);
  if (compiledRoutes.size === 0) {
    throw new TypeError('The root Routes passed to Application.make must contain a Page.');
  }

  function renderRouteTree({
    pathname,
    runtime,
  }: ApplicationComponentProps<RoutesServices<Definition>>) {
    const route = compiledRoutes.get(pathname);
    if (route === undefined) {
      throw new TypeError(`No static route is registered for "${pathname}".`);
    }

    const Page = route.page as PageComponent<RoutesServices<Definition>>;
    let tree: RouteTreeModel = {
      child: null,
      content: <Page runtime={runtime} />,
      id: pathname,
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
          id: pathname,
        };
      }

      if (scope.layout !== null) {
        const Layout = scope.layout as LayoutComponent<RoutesServices<Definition>>;
        tree = {
          child: tree,
          content: (
            <Layout runtime={runtime}>
              <RouteOutlet />
            </Layout>
          ),
          id: scope.id,
        };
      }
    }

    return tree;
  }

  return {
    paths: Object.freeze([...compiledRoutes.keys()]),
    renderRouteTree,
    servicesLayer: resolveServicesLayer<RoutesServices<Definition>, ApplicationError>(
      servicesLayer,
    ),
  };
};

export const Application = { make } as const;
