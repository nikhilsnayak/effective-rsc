import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import type { PageComponent } from './page';
import { joinRoutePaths, type StaticPath, validateUnreservedPath } from './route-path';
import type { AnyRoutes } from './routes';

export type RouteScope = {
  readonly id: StaticPath;
  readonly layout: LayoutComponent<unknown> | null;
  readonly loading: LoadingComponent | null;
};

export type CompiledRoute = {
  readonly page: PageComponent<unknown>;
  readonly scopes: ReadonlyArray<RouteScope>;
};

export type CompiledRouteGraph = {
  readonly paths: ReadonlyArray<StaticPath>;
  readonly route: (pathname: StaticPath) => CompiledRoute | undefined;
};

const flattenRouteGraph = (
  routes: AnyRoutes,
  prefix: StaticPath,
  inheritedScopes: ReadonlyArray<RouteScope>,
  destinations: Map<StaticPath, CompiledRoute>,
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
    validateUnreservedPath(pathname);
    destinations.set(pathname, { page: route.page, scopes });
  }

  for (const mount of routes.mounts) {
    flattenRouteGraph(mount.routes, joinRoutePaths(prefix, mount.path), scopes, destinations);
  }
};

export const compileRouteGraph = (routes: AnyRoutes): CompiledRouteGraph => {
  if (routes.layout === null) {
    throw new TypeError('The root Routes passed to Application.make must define a Layout.');
  }

  const destinations = new Map<StaticPath, CompiledRoute>();
  flattenRouteGraph(routes, '/', [], destinations);
  if (destinations.size === 0) {
    throw new TypeError('The root Routes passed to Application.make must contain a Page.');
  }

  return {
    paths: Object.freeze([...destinations.keys()]),
    route: (pathname) => destinations.get(pathname),
  };
};
