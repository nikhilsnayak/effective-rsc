import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import { getPageState, type PageImplementationState } from './page';
import { type AbsolutePath, joinRoutePaths, validateUnreservedPath } from './route-path';
import { type AnyRoutes, getRoutesState } from './routes';

export type RouteScope<Services> = {
  readonly id: string;
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
};

export type CompiledDestination<Services> = {
  readonly page: PageImplementationState<Services>;
  readonly pattern: AbsolutePath;
  readonly scopes: ReadonlyArray<RouteScope<Services>>;
};

export const compileRouteGraph = <Services>(
  routes: AnyRoutes<Services>,
): ReadonlyArray<CompiledDestination<Services>> => {
  const rootState = getRoutesState(routes);
  if (rootState.layout === null) {
    throw new TypeError('The root Routes passed to ERSC.make must define a Layout.');
  }

  const destinations: Array<CompiledDestination<Services>> = [];
  const visit = (
    current: AnyRoutes<Services>,
    prefix: AbsolutePath,
    inheritedScopes: ReadonlyArray<RouteScope<Services>>,
  ): void => {
    const currentState = getRoutesState(current);
    const scopes =
      currentState.layout === null && currentState.loading === null
        ? inheritedScopes
        : Object.freeze([
            ...inheritedScopes,
            Object.freeze({
              id: `${currentState.scopeId}:${prefix}`,
              layout: currentState.layout,
              loading: currentState.loading,
            }),
          ]);

    for (const route of currentState.pages) {
      const pattern = joinRoutePaths(prefix, route.path);
      validateUnreservedPath(pattern);
      destinations.push(Object.freeze({ page: getPageState(route.page), pattern, scopes }));
    }

    for (const mount of currentState.mounts) {
      visit(mount.routes, joinRoutePaths(prefix, mount.path), scopes);
    }
  };

  visit(routes, '/', []);
  if (destinations.length === 0) {
    throw new TypeError('The root Routes passed to ERSC.make must contain a Page.');
  }

  return Object.freeze(destinations);
};
