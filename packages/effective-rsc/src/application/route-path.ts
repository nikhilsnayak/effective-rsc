export type StaticPath = `/${string}`;

type InvalidPathCharacter = ':' | '*' | '?' | '#';

export type ValidStaticPath<Path extends StaticPath> =
  Path extends `${string}${InvalidPathCharacter}${string}` ? never : Path;

export type JoinPath<Prefix extends StaticPath, Path extends StaticPath> = Prefix extends '/'
  ? Path
  : Path extends '/'
    ? Prefix
    : `${Prefix}${Path}`;

export const FrameworkAssetNamespace = '/_ersc/assets';

export const FrameworkAssetPrefix = `${FrameworkAssetNamespace}/` as const;

export type ReservedPath =
  | typeof FrameworkAssetNamespace
  | `${typeof FrameworkAssetNamespace}/${string}`;

const InvalidStaticPath = /[:*?#]/u;

export const validateStaticPath = (path: string) => {
  if (!path.startsWith('/') || InvalidStaticPath.test(path)) {
    throw new TypeError(
      `Invalid static route path "${path}". Static routes must start with "/" and cannot contain ":", "*", "?", or "#".`,
    );
  }
};

export const validateUnreservedPath = (pathname: string) => {
  if (pathname === FrameworkAssetNamespace || pathname.startsWith(FrameworkAssetPrefix)) {
    throw new TypeError(
      `Static route "${pathname}" uses the framework-reserved "${FrameworkAssetNamespace}" namespace.`,
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
