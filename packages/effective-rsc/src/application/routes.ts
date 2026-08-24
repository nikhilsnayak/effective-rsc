import type { LayoutComponent } from './layout';
import type { LoadingComponent } from './loading';
import type { PageComponent } from './page';

declare const RoutesTypeId: unique symbol;

export type Absent = {
  readonly kind: 'Absent';
};

export type Present<Value> = {
  readonly kind: 'Present';
  readonly value: Value;
};

type LayoutState = Absent | Present<LayoutComponent<unknown>>;
type LoadingState = Absent | Present<LoadingComponent>;

type StaticPath = `/${string}`;
type InvalidPathCharacter = ':' | '*' | '?' | '#';

type ValidStaticPath<Path extends StaticPath> =
  Path extends `${string}${InvalidPathCharacter}${string}` ? never : Path;

type JoinPath<Prefix extends StaticPath, Path extends StaticPath> = Prefix extends '/'
  ? Path
  : Path extends '/'
    ? Prefix
    : `${Prefix}${Path}`;

type MountedPaths<Prefix extends StaticPath, Child> =
  RoutesPaths<Child> extends infer Path extends StaticPath ? JoinPath<Prefix, Path> : never;

type NoPathCollision<Current extends string, Added extends string> = [
  Extract<Current, Added>,
] extends [never]
  ? unknown
  : never;

type NonEmptyRoutes<Definition> = [RoutesPaths<Definition>] extends [never] ? never : unknown;

export type RoutesPage = {
  readonly page: PageComponent<unknown>;
  readonly path: StaticPath;
};

export type RoutesMount = {
  readonly path: StaticPath;
  readonly routes: AnyRoutes;
};

export interface RoutesDefinition<
  out Layout extends LayoutState,
  out Loading extends LoadingState,
  out Paths extends string,
  out Services,
> {
  readonly [RoutesTypeId]: {
    readonly layout: Layout;
    readonly loading: Loading;
    readonly paths: Paths;
    readonly services: Services;
  };
  readonly layout: LayoutComponent<unknown> | null;
  readonly loading: LoadingComponent | null;
  readonly mounts: ReadonlyArray<RoutesMount>;
  readonly pages: ReadonlyArray<RoutesPage>;
  readonly paths: ReadonlyArray<StaticPath>;

  page<const Path extends StaticPath, PageServices>(
    path: Path & ValidStaticPath<Path> & NoPathCollision<Paths, Path>,
    page: PageComponent<PageServices>,
  ): RoutesDefinition<Layout, Loading, Paths | Path, Services | PageServices>;

  mount<const Prefix extends StaticPath, const Child extends AnyRoutes>(
    path: Prefix & ValidStaticPath<Prefix>,
    routes: Child & NonEmptyRoutes<Child> & NoPathCollision<Paths, MountedPaths<Prefix, Child>>,
  ): RoutesDefinition<
    Layout,
    Loading,
    Paths | MountedPaths<Prefix, Child>,
    Services | RoutesServices<Child>
  >;
}

export type AnyRoutes = RoutesDefinition<LayoutState, LoadingState, string, unknown>;

export type RoutesLayout<Definition> =
  Definition extends RoutesDefinition<infer Layout, infer _Loading, infer _Paths, infer _Services>
    ? Layout
    : never;

export type RoutesPaths<Definition> =
  Definition extends RoutesDefinition<infer _Layout, infer _Loading, infer Paths, infer _Services>
    ? Paths
    : never;

export type RoutesServices<Definition> =
  Definition extends RoutesDefinition<infer _Layout, infer _Loading, infer _Paths, infer Services>
    ? Services
    : never;

type RoutesOptions = {
  readonly layout?: LayoutComponent<unknown>;
  readonly loading?: LoadingComponent;
};

type LayoutFromOptions<Options> = Options extends {
  readonly layout: infer Layout extends LayoutComponent<unknown>;
}
  ? Present<Layout>
  : Absent;

type LoadingFromOptions<Options> = Options extends {
  readonly loading: infer Loading extends LoadingComponent;
}
  ? Present<Loading>
  : Absent;

type LayoutServices<Options> = Options extends {
  readonly layout: LayoutComponent<infer Services>;
}
  ? Services
  : never;

const InvalidStaticPath = /[:*?#]/u;

const validateStaticPath = (path: string) => {
  if (!path.startsWith('/') || InvalidStaticPath.test(path)) {
    throw new TypeError(
      `Invalid static route path "${path}". Static routes must start with "/" and cannot contain ":", "*", "?", or "#".`,
    );
  }
};

export const joinRoutePaths = (prefix: StaticPath, path: StaticPath): StaticPath => {
  if (prefix === '/') {
    return path;
  }
  if (path === '/') {
    return prefix;
  }
  return `${prefix}${path}`;
};

type RuntimeRoutesOptions = {
  readonly layout: LayoutComponent<unknown> | null;
  readonly loading: LoadingComponent | null;
  readonly mounts: ReadonlyArray<RoutesMount>;
  readonly pages: ReadonlyArray<RoutesPage>;
  readonly paths: ReadonlyArray<StaticPath>;
};

const makeDefinition = <
  Layout extends LayoutState,
  Loading extends LoadingState,
  Paths extends string,
  Services,
>({
  layout,
  loading,
  mounts,
  pages,
  paths,
}: RuntimeRoutesOptions) => {
  const pathSet = new Set(paths);

  const definition = {
    layout,
    loading,
    mounts,
    pages,
    paths,
    page(path: StaticPath, page: PageComponent<unknown>) {
      validateStaticPath(path);
      if (pathSet.has(path)) {
        throw new TypeError(`Static route "${path}" is declared more than once.`);
      }

      return makeDefinition({
        layout,
        loading,
        mounts,
        pages: Object.freeze([...pages, { page, path }]),
        paths: Object.freeze([...paths, path]),
      });
    },
    mount(path: StaticPath, routes: AnyRoutes) {
      validateStaticPath(path);
      if (routes.paths.length === 0) {
        throw new TypeError(`Cannot mount empty Routes at "${path}".`);
      }

      const mountedPaths = routes.paths.map((childPath) => joinRoutePaths(path, childPath));
      const duplicatePath = mountedPaths.find((mountedPath) => pathSet.has(mountedPath));
      if (duplicatePath !== undefined) {
        throw new TypeError(`Static route "${duplicatePath}" is declared more than once.`);
      }

      return makeDefinition({
        layout,
        loading,
        mounts: Object.freeze([...mounts, { path, routes }]),
        pages,
        paths: Object.freeze([...paths, ...mountedPaths]),
      });
    },
  };

  return Object.freeze(definition) as unknown as RoutesDefinition<Layout, Loading, Paths, Services>;
};

function make(): RoutesDefinition<Absent, Absent, never, never>;
function make<const Options extends RoutesOptions>(
  options: Options,
): RoutesDefinition<
  LayoutFromOptions<Options>,
  LoadingFromOptions<Options>,
  never,
  LayoutServices<Options>
>;
function make(options: RoutesOptions = {}) {
  return makeDefinition({
    layout: options.layout ?? null,
    loading: options.loading ?? null,
    mounts: Object.freeze([]),
    pages: Object.freeze([]),
    paths: Object.freeze([]),
  });
}

export const Routes = { make } as const;
