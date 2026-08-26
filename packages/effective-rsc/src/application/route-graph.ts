import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import type { AnyPageDefinition } from './page';
import { type AbsolutePath, joinRoutePaths, validateUnreservedPath } from './route-path';
import { type AnyRoutes, RoutesScopeIdTypeId } from './routes';

export type RouteScope<Services> = {
  readonly id: string;
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
};

export type CompiledDestination<Services> = {
  readonly page: AnyPageDefinition<Services>;
  readonly pattern: AbsolutePath;
  readonly scopes: ReadonlyArray<RouteScope<Services>>;
};

export const compileRouteGraph = <Services>(
  routes: AnyRoutes<Services>,
): ReadonlyArray<CompiledDestination<Services>> => {
  if (routes.layout === null) {
    throw new TypeError('The root Routes passed to ERSC.make must define a Layout.');
  }

  const destinations: Array<CompiledDestination<Services>> = [];
  const visit = (
    current: AnyRoutes<Services>,
    prefix: AbsolutePath,
    inheritedScopes: ReadonlyArray<RouteScope<Services>>,
  ): void => {
    const scopes =
      current.layout === null && current.loading === null
        ? inheritedScopes
        : Object.freeze([
            ...inheritedScopes,
            Object.freeze({
              id: `${current[RoutesScopeIdTypeId]}:${prefix}`,
              layout: current.layout,
              loading: current.loading,
            }),
          ]);

    for (const route of current.pages) {
      const pattern = joinRoutePaths(prefix, route.path);
      validateUnreservedPath(pattern);
      destinations.push(Object.freeze({ page: route.page, pattern, scopes }));
    }

    for (const mount of current.mounts) {
      visit(mount.routes, joinRoutePaths(prefix, mount.path), scopes);
    }
  };

  visit(routes, '/', []);
  if (destinations.length === 0) {
    throw new TypeError('The root Routes passed to ERSC.make must contain a Page.');
  }

  return Object.freeze(destinations);
};
