import type { Types } from 'effect';

import {
  type ERSCIdentity,
  ERSCIdentityTypeId,
  type ERSCMember,
  getERSCIdentity,
} from './ersc-identity';
import { isLayoutConcern, type LayoutComponent } from './layout';
import { isLoadingConcern, type LoadingComponent } from './loading';
import { type AnyPageDefinition, getPageState, isPageDefinition, type PageConcern } from './page';
import {
  type AbsolutePath,
  analyzeRoutePath,
  joinRoutePaths,
  type JoinPath,
  type RouteParamNames,
  type RouteShape,
  type ValidRoutePath,
} from './route-path';

declare const RoutesContractTypeId: unique symbol;

type RoutesState<HasLayout extends boolean, Paths extends AbsolutePath> = {
  readonly hasLayout: Types.Covariant<HasLayout>;
  readonly paths: Types.Covariant<Paths>;
};

type MountedPaths<Prefix extends AbsolutePath, Child> =
  RoutesPaths<Child> extends infer Path extends AbsolutePath ? JoinPath<Prefix, Path> : never;

type RouteShapes<Paths extends AbsolutePath> = Paths extends AbsolutePath
  ? RouteShape<Paths>
  : never;

type NoPathCollision<Current extends AbsolutePath, Added extends AbsolutePath> = [
  Extract<RouteShapes<Current>, RouteShapes<Added>>,
] extends [never]
  ? unknown
  : never;

type PageParamNames<Page> =
  Page extends PageConcern<infer ParamNames, infer _Mode> ? ParamNames : never;

type PageMode<Page> = Page extends PageConcern<infer _ParamNames, infer Mode> ? Mode : never;

type ExactPageParamNames<Path extends AbsolutePath, Page> = [RouteParamNames<Path>] extends [
  PageParamNames<Page>,
]
  ? [PageParamNames<Page>] extends [RouteParamNames<Path>]
    ? unknown
    : never
  : never;

type MatchingPageParams<Path extends AbsolutePath, Page> =
  PageMode<Page> extends 'Static'
    ? [RouteParamNames<Path>] extends [never]
      ? unknown
      : never
    : PageMode<Page> extends 'Parameterized'
      ? [RouteParamNames<Path>] extends [never]
        ? never
        : ExactPageParamNames<Path, Page>
      : never;

type StaticMountPath<Path extends AbsolutePath> = [RouteParamNames<Path>] extends [never]
  ? unknown
  : never;

type KnownNonEmptyRoutes<Definition> =
  AbsolutePath extends RoutesPaths<Definition>
    ? never
    : [RoutesPaths<Definition>] extends [never]
      ? never
      : unknown;

export interface RoutesDefinition<
  Services,
  out HasLayout extends boolean,
  out Paths extends AbsolutePath,
> extends ERSCMember<Services> {
  readonly [RoutesContractTypeId]: RoutesState<HasLayout, Paths>;

  page<const Path extends AbsolutePath, const Page extends AnyPageDefinition<Services>>(
    path: Path & ValidRoutePath<Path> & NoPathCollision<Paths, Path>,
    page: Page & MatchingPageParams<Path, Page>,
  ): RoutesDefinition<Services, HasLayout, Paths | Path>;

  mount<const Prefix extends AbsolutePath, const Child extends AnyRoutes<Services>>(
    path: Prefix & ValidRoutePath<Prefix> & StaticMountPath<Prefix>,
    routes: Child &
      KnownNonEmptyRoutes<Child> &
      NoPathCollision<Paths, MountedPaths<Prefix, Child>>,
  ): RoutesDefinition<Services, HasLayout, Paths | MountedPaths<Prefix, Child>>;
}

export type AnyRoutes<Services> = RoutesDefinition<Services, boolean, AbsolutePath>;

export type RoutesHasLayout<Definition> =
  Definition extends RoutesDefinition<infer _Services, infer HasLayout, infer _Paths>
    ? HasLayout
    : never;

export type RoutesPaths<Definition> =
  Definition extends RoutesDefinition<infer _Services, infer _HasLayout, infer Paths>
    ? Paths
    : never;

type RoutesPage<Services> = {
  readonly page: AnyPageDefinition<Services>;
  readonly path: AbsolutePath;
};

type RoutesMount<Services> = {
  readonly path: AbsolutePath;
  readonly routes: AnyRoutes<Services>;
};

export type RoutesImplementationState<Services> = {
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
  readonly mounts: ReadonlyArray<RoutesMount<Services>>;
  readonly pages: ReadonlyArray<RoutesPage<Services>>;
  readonly paths: ReadonlyArray<AbsolutePath>;
  readonly scopeId: number;
};

type RoutesOptions<Services> = {
  readonly layout?: LayoutComponent<Services>;
  readonly loading?: LoadingComponent<Services>;
};

type HasLayoutFromOptions<Options> = Options extends { readonly layout: unknown } ? true : false;

type RuntimeRoutesOptions<Services> = RoutesImplementationState<Services> & {
  readonly routeShapes: ReadonlySet<string>;
};

class RoutesDefinitionImpl<
  Services,
  HasLayout extends boolean,
  Paths extends AbsolutePath,
> implements RoutesDefinition<Services, HasLayout, Paths> {
  declare readonly [RoutesContractTypeId]: RoutesState<HasLayout, Paths>;
  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;

  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
  readonly mounts: ReadonlyArray<RoutesMount<Services>>;
  readonly pages: ReadonlyArray<RoutesPage<Services>>;
  readonly paths: ReadonlyArray<AbsolutePath>;
  readonly scopeId: number;
  readonly #routeShapes: ReadonlySet<string>;

  constructor(
    identity: ERSCIdentity<Services>,
    { layout, loading, mounts, pages, paths, routeShapes, scopeId }: RuntimeRoutesOptions<Services>,
  ) {
    this[ERSCIdentityTypeId] = identity;
    this.layout = layout;
    this.loading = loading;
    this.mounts = mounts;
    this.pages = pages;
    this.paths = paths;
    this.scopeId = scopeId;
    this.#routeShapes = routeShapes;
    Object.freeze(this);
  }

  page<const Path extends AbsolutePath, const Page extends AnyPageDefinition<Services>>(
    path: Path & ValidRoutePath<Path> & NoPathCollision<Paths, Path>,
    page: Page & MatchingPageParams<Path, Page>,
  ): RoutesDefinitionImpl<Services, HasLayout, Paths | Path> {
    const route = analyzeRoutePath(path);
    if (this.#routeShapes.has(route.shape)) {
      throw new TypeError(`Route "${path}" conflicts with an existing route pattern.`);
    }
    if (!isPageDefinition(page)) {
      throw new TypeError(`Page for "${path}" must be created with ERSC.Page.make.`);
    }
    if (getERSCIdentity(page) !== this[ERSCIdentityTypeId]) {
      throw new TypeError(`Page for "${path}" was created by a different ERSC module.`);
    }

    const pageState = getPageState(page);
    if (route._tag === 'ParameterFree' && pageState.paramsSchema !== null) {
      throw new TypeError(`Parameterized Page for "${path}" requires route parameters.`);
    }
    if (route._tag === 'Parameterized' && pageState.paramsSchema === null) {
      throw new TypeError(`Page for "${path}" must declare a parameter Schema.`);
    }

    const routeShapes = new Set(this.#routeShapes);
    routeShapes.add(route.shape);

    return new RoutesDefinitionImpl(this[ERSCIdentityTypeId], {
      layout: this.layout,
      loading: this.loading,
      mounts: this.mounts,
      pages: Object.freeze([...this.pages, Object.freeze({ page, path })]),
      paths: Object.freeze([...this.paths, path]),
      routeShapes,
      scopeId: this.scopeId,
    });
  }

  mount<const Prefix extends AbsolutePath, const Child extends AnyRoutes<Services>>(
    path: Prefix & ValidRoutePath<Prefix> & StaticMountPath<Prefix>,
    routes: Child &
      KnownNonEmptyRoutes<Child> &
      NoPathCollision<Paths, MountedPaths<Prefix, Child>>,
  ): RoutesDefinitionImpl<Services, HasLayout, Paths | MountedPaths<Prefix, Child>> {
    const route = analyzeRoutePath(path);
    if (route._tag === 'Parameterized') {
      throw new TypeError(`Routes cannot be mounted beneath parameterized path "${path}".`);
    }
    if (!(routes instanceof RoutesDefinitionImpl)) {
      throw new TypeError(`Routes mounted at "${path}" must be created with ERSC.Routes.make.`);
    }
    const routesState = getRoutesState(routes);
    if (routesState.paths.length === 0) {
      throw new TypeError(`Cannot mount empty Routes at "${path}".`);
    }
    if (getERSCIdentity(routes) !== this[ERSCIdentityTypeId]) {
      throw new TypeError(`Routes mounted at "${path}" were created by a different ERSC module.`);
    }

    const mountedPaths = routesState.paths.map((childPath) => joinRoutePaths(path, childPath));
    const routeShapes = new Set(this.#routeShapes);
    for (const mountedPath of mountedPaths) {
      const shape = analyzeRoutePath(mountedPath).shape;
      if (routeShapes.has(shape)) {
        throw new TypeError(`Route "${mountedPath}" conflicts with an existing route pattern.`);
      }
      routeShapes.add(shape);
    }

    return new RoutesDefinitionImpl(this[ERSCIdentityTypeId], {
      layout: this.layout,
      loading: this.loading,
      mounts: Object.freeze([...this.mounts, Object.freeze({ path, routes })]),
      pages: this.pages,
      paths: Object.freeze([...this.paths, ...mountedPaths]),
      routeShapes,
      scopeId: this.scopeId,
    });
  }
}

const isRoutesImplementation = <Services>(
  routes: AnyRoutes<Services>,
): routes is AnyRoutes<Services> & RoutesDefinitionImpl<Services, boolean, AbsolutePath> =>
  routes instanceof RoutesDefinitionImpl;

export const getRoutesState = <Services>(
  routes: AnyRoutes<Services>,
): RoutesImplementationState<Services> => {
  if (!isRoutesImplementation(routes)) {
    throw new TypeError('Routes must be created with ERSC.Routes.make.');
  }
  return routes;
};

export type RoutesFactory<Services> = {
  readonly make: {
    (): RoutesDefinition<Services, false, never>;
    <Options extends RoutesOptions<Services>>(
      options: Options,
    ): RoutesDefinition<Services, HasLayoutFromOptions<Options>, never>;
  };
};

export const makeRoutesFactory = <Services>(
  identity: ERSCIdentity<Services>,
): RoutesFactory<Services> => {
  let nextScopeId = 0;

  function make(): RoutesDefinition<Services, false, never>;
  function make<Options extends RoutesOptions<Services>>(
    options: Options,
  ): RoutesDefinition<Services, HasLayoutFromOptions<Options>, never>;
  function make(options: RoutesOptions<Services> = {}): AnyRoutes<Services> {
    if (options.layout !== undefined) {
      if (!isLayoutConcern(options.layout)) {
        throw new TypeError('Layout must be created with ERSC.Layout.make.');
      }
      if (getERSCIdentity(options.layout) !== identity) {
        throw new TypeError('Layout was created by a different ERSC module.');
      }
    }
    if (options.loading !== undefined) {
      if (!isLoadingConcern(options.loading)) {
        throw new TypeError('Loading must be created with ERSC.Loading.make.');
      }
      if (getERSCIdentity(options.loading) !== identity) {
        throw new TypeError('Loading was created by a different ERSC module.');
      }
    }

    const scopeId = nextScopeId;
    nextScopeId += 1;

    return new RoutesDefinitionImpl(identity, {
      layout: options.layout ?? null,
      loading: options.loading ?? null,
      mounts: Object.freeze([]),
      pages: Object.freeze([]),
      paths: Object.freeze([]),
      routeShapes: new Set(),
      scopeId,
    });
  }

  return { make };
};
