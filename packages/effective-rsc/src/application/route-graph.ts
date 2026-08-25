import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import type { PageComponent } from './page';
import { joinRoutePaths, type StaticPath, validateUnreservedPath } from './route-path';
import { type AnyRoutes, RoutesScopeIdTypeId } from './routes';

type RouteScope<Services> = {
  readonly id: string;
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
};

type CompiledRoute<Services> = {
  readonly page: PageComponent<Services>;
  readonly scopes: ReadonlyArray<RouteScope<Services>>;
};

type CompiledRouteGraph<Services> = {
  readonly paths: ReadonlyArray<StaticPath>;
  readonly route: (pathname: StaticPath) => CompiledRoute<Services> | undefined;
};

const flattenRouteGraph = <Services>(
  routes: AnyRoutes<Services>,
  prefix: StaticPath,
  inheritedScopes: ReadonlyArray<RouteScope<Services>>,
  destinations: Map<StaticPath, CompiledRoute<Services>>,
) => {
  const scopes =
    routes.layout === null && routes.loading === null
      ? inheritedScopes
      : [
          ...inheritedScopes,
          {
            id: `${routes[RoutesScopeIdTypeId]}:${prefix}`,
            layout: routes.layout,
            loading: routes.loading,
          },
        ];

  for (const route of routes.pages) {
    const pathname = joinRoutePaths(prefix, route.path);
    validateUnreservedPath(pathname);
    destinations.set(pathname, { page: route.page, scopes });
  }

  for (const mount of routes.mounts) {
    flattenRouteGraph(mount.routes, joinRoutePaths(prefix, mount.path), scopes, destinations);
  }
};

export const compileRouteGraph = <Services>(
  routes: AnyRoutes<Services>,
): CompiledRouteGraph<Services> => {
  if (routes.layout === null) {
    throw new TypeError('The root Routes passed to ERSC.make must define a Layout.');
  }

  const destinations = new Map<StaticPath, CompiledRoute<Services>>();
  flattenRouteGraph(routes, '/', [], destinations);
  if (destinations.size === 0) {
    throw new TypeError('The root Routes passed to ERSC.make must contain a Page.');
  }

  return {
    paths: Object.freeze([...destinations.keys()]),
    route: (pathname) => destinations.get(pathname),
  };
};
