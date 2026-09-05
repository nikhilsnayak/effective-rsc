import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import type { AnyMiddleware } from './middleware';
import { getPageState, type PageImplementationState } from './page';
import { type AbsolutePath, joinRoutePaths, validateUnreservedPath } from './route-path';
import { type AnyRoutes, getRoutesState } from './routes';

export type RouteScope<Services> = {
  readonly id: string;
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
};

export type CompiledDestination<Services> = {
  readonly middleware: ReadonlyArray<AnyMiddleware<Services>>;
  readonly page: PageImplementationState<Services>;
  readonly pattern: AbsolutePath;
  readonly scopes: ReadonlyArray<RouteScope<Services>>;
};

export type CompiledRouteGraph<Services> = readonly [
  CompiledDestination<Services>,
  ...Array<CompiledDestination<Services>>,
];

const resolveRouteMiddleware = <Services>(
  inherited: ReadonlyArray<AnyMiddleware<Services>>,
  declared: ReadonlyArray<AnyMiddleware<Services>>,
) => {
  let sharedCount = 0;
  while (sharedCount < inherited.length && inherited[sharedCount] === declared[sharedCount]) {
    sharedCount += 1;
  }

  return sharedCount === inherited.length
    ? declared
    : Object.freeze([...inherited, ...declared.slice(sharedCount)]);
};

export const compileRouteGraph = <Services>(
  routes: AnyRoutes<Services>,
): CompiledRouteGraph<Services> => {
  const rootState = getRoutesState(routes);
  if (rootState.layout === null) {
    throw new TypeError('The root Routes passed to ERSC.make must define a Layout.');
  }

  const destinations: Array<CompiledDestination<Services>> = [];
  const visit = (
    current: AnyRoutes<Services>,
    prefix: AbsolutePath,
    inheritedScopes: ReadonlyArray<RouteScope<Services>>,
    inheritedMiddleware: ReadonlyArray<AnyMiddleware<Services>>,
  ): void => {
    const currentState = getRoutesState(current);
    const middleware = resolveRouteMiddleware(inheritedMiddleware, currentState.middleware);
    if (new Set(middleware).size !== middleware.length) {
      throw new TypeError(
        `Middleware beneath route prefix "${prefix}" appears more than once in its resolved chain.`,
      );
    }
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
      destinations.push(
        Object.freeze({ middleware, page: getPageState(route.page), pattern, scopes }),
      );
    }

    for (const mount of currentState.mounts) {
      visit(mount.routes, joinRoutePaths(prefix, mount.path), scopes, middleware);
    }
  };

  visit(routes, '/', [], []);
  const [firstDestination, ...remainingDestinations] = destinations;
  if (firstDestination === undefined) {
    throw new TypeError('The root Routes passed to ERSC.make must contain a Page.');
  }

  return Object.freeze([firstDestination, ...remainingDestinations]);
};
