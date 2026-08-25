import type { ERSCIdentity, ERSCMember } from './ersc-identity';
import { ERSCIdentityTypeId } from './ersc-identity';
import { isLayoutConcern, type LayoutComponent } from './layout';
import { isLoadingConcern, type LoadingComponent } from './loading';
import { isPageConcern, type PageComponent } from './page';
import {
  joinRoutePaths,
  type JoinPath,
  type StaticPath,
  validateStaticPath,
  type ValidStaticPath,
} from './route-path';

declare const RoutesTypeId: unique symbol;

export const RoutesScopeIdTypeId: unique symbol = Symbol('effective-rsc/RoutesScopeId');

type RoutesState<HasLayout extends boolean, Paths extends string> = {
  readonly hasLayout: HasLayout;
  readonly paths: Paths;
};

type MountedPaths<Prefix extends StaticPath, Child> =
  RoutesPaths<Child> extends infer Path extends StaticPath ? JoinPath<Prefix, Path> : never;

type NoPathCollision<Current extends string, Added extends string> = [
  Extract<Current, Added>,
] extends [never]
  ? unknown
  : never;

type NonEmptyRoutes<Definition> = [RoutesPaths<Definition>] extends [never] ? never : unknown;

export type RoutesPage<Services> = {
  readonly page: PageComponent<Services>;
  readonly path: StaticPath;
};

export type RoutesMount<Services> = {
  readonly path: StaticPath;
  readonly routes: AnyRoutes<Services>;
};

export interface RoutesDefinition<
  Services,
  out HasLayout extends boolean,
  out Paths extends string,
> extends ERSCMember<Services> {
  readonly [RoutesTypeId]: RoutesState<HasLayout, Paths>;
  readonly [RoutesScopeIdTypeId]: number;
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
  readonly mounts: ReadonlyArray<RoutesMount<Services>>;
  readonly pages: ReadonlyArray<RoutesPage<Services>>;
  readonly paths: ReadonlyArray<StaticPath>;

  page<const Path extends StaticPath>(
    path: Path & ValidStaticPath<Path> & NoPathCollision<Paths, Path>,
    page: PageComponent<Services>,
  ): RoutesDefinition<Services, HasLayout, Paths | Path>;

  mount<const Prefix extends StaticPath, const Child extends AnyRoutes<Services>>(
    path: Prefix & ValidStaticPath<Prefix>,
    routes: Child & NonEmptyRoutes<Child> & NoPathCollision<Paths, MountedPaths<Prefix, Child>>,
  ): RoutesDefinition<Services, HasLayout, Paths | MountedPaths<Prefix, Child>>;
}

export type AnyRoutes<Services> = RoutesDefinition<Services, boolean, string>;

export type RoutesHasLayout<Definition> = Definition extends {
  readonly [RoutesTypeId]: RoutesState<infer HasLayout, string>;
}
  ? HasLayout
  : never;

export type RoutesPaths<Definition> = Definition extends {
  readonly [RoutesTypeId]: RoutesState<boolean, infer Paths>;
}
  ? Paths
  : never;

type RoutesOptions<Services> = {
  readonly layout?: LayoutComponent<Services>;
  readonly loading?: LoadingComponent<Services>;
};

type HasLayoutFromOptions<Options> = Options extends { readonly layout: unknown } ? true : false;

type RuntimeRoutesOptions<Services> = {
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
  readonly mounts: ReadonlyArray<RoutesMount<Services>>;
  readonly pages: ReadonlyArray<RoutesPage<Services>>;
  readonly paths: ReadonlyArray<StaticPath>;
  readonly scopeId: number;
};

class RoutesDefinitionImpl<
  Services,
  HasLayout extends boolean,
  Paths extends string,
> implements RoutesDefinition<Services, HasLayout, Paths> {
  declare readonly [RoutesTypeId]: RoutesState<HasLayout, Paths>;

  readonly [ERSCIdentityTypeId]: ERSCIdentity<Services>;
  readonly [RoutesScopeIdTypeId]: number;
  readonly layout: LayoutComponent<Services> | null;
  readonly loading: LoadingComponent<Services> | null;
  readonly mounts: ReadonlyArray<RoutesMount<Services>>;
  readonly pages: ReadonlyArray<RoutesPage<Services>>;
  readonly paths: ReadonlyArray<StaticPath>;
  readonly #pathSet: ReadonlySet<StaticPath>;

  constructor(
    identity: ERSCIdentity<Services>,
    { layout, loading, mounts, pages, paths, scopeId }: RuntimeRoutesOptions<Services>,
  ) {
    this[ERSCIdentityTypeId] = identity;
    this[RoutesScopeIdTypeId] = scopeId;
    this.layout = layout;
    this.loading = loading;
    this.mounts = mounts;
    this.pages = pages;
    this.paths = paths;
    this.#pathSet = new Set(paths);
    Object.freeze(this);
  }

  page<const Path extends StaticPath>(
    path: Path & ValidStaticPath<Path> & NoPathCollision<Paths, Path>,
    page: PageComponent<Services>,
  ): RoutesDefinitionImpl<Services, HasLayout, Paths | Path> {
    validateStaticPath(path);
    if (this.#pathSet.has(path)) {
      throw new TypeError(`Static route "${path}" is declared more than once.`);
    }
    if (!isPageConcern(page)) {
      throw new TypeError(`Page for "${path}" must be created with ERSC.Page.make.`);
    }
    if (page[ERSCIdentityTypeId] !== this[ERSCIdentityTypeId]) {
      throw new TypeError(`Page for "${path}" was created by a different ERSC module.`);
    }

    return new RoutesDefinitionImpl(this[ERSCIdentityTypeId], {
      layout: this.layout,
      loading: this.loading,
      mounts: this.mounts,
      pages: Object.freeze([...this.pages, { page, path }]),
      paths: Object.freeze([...this.paths, path]),
      scopeId: this[RoutesScopeIdTypeId],
    });
  }

  mount<const Prefix extends StaticPath, const Child extends AnyRoutes<Services>>(
    path: Prefix & ValidStaticPath<Prefix>,
    routes: Child & NonEmptyRoutes<Child> & NoPathCollision<Paths, MountedPaths<Prefix, Child>>,
  ): RoutesDefinitionImpl<Services, HasLayout, Paths | MountedPaths<Prefix, Child>> {
    validateStaticPath(path);
    if (routes.paths.length === 0) {
      throw new TypeError(`Cannot mount empty Routes at "${path}".`);
    }
    if (routes[ERSCIdentityTypeId] !== this[ERSCIdentityTypeId]) {
      throw new TypeError(`Routes mounted at "${path}" were created by a different ERSC module.`);
    }

    const mountedPaths = routes.paths.map((childPath) => joinRoutePaths(path, childPath));
    const duplicatePath = mountedPaths.find((mountedPath) => this.#pathSet.has(mountedPath));
    if (duplicatePath !== undefined) {
      throw new TypeError(`Static route "${duplicatePath}" is declared more than once.`);
    }

    return new RoutesDefinitionImpl(this[ERSCIdentityTypeId], {
      layout: this.layout,
      loading: this.loading,
      mounts: Object.freeze([...this.mounts, { path, routes }]),
      pages: this.pages,
      paths: Object.freeze([...this.paths, ...mountedPaths]),
      scopeId: this[RoutesScopeIdTypeId],
    });
  }
}

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
      if (options.layout[ERSCIdentityTypeId] !== identity) {
        throw new TypeError('Layout was created by a different ERSC module.');
      }
    }
    if (options.loading !== undefined) {
      if (!isLoadingConcern(options.loading)) {
        throw new TypeError('Loading must be created with ERSC.Loading.make.');
      }
      if (options.loading[ERSCIdentityTypeId] !== identity) {
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
      scopeId,
    });
  }

  return { make };
};
