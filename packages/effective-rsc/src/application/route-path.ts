export type StaticPath = `/${string}`;

type InvalidPathCharacter = ':' | '*' | '?' | '#';

export type ValidStaticPath<Path extends StaticPath> =
  Path extends `${string}${InvalidPathCharacter}${string}` ? never : Path;

export type JoinPath<Prefix extends StaticPath, Path extends StaticPath> = Prefix extends '/'
  ? Path
  : Path extends '/'
    ? Prefix
    : `${Prefix}${Path}`;

export type ReservedPath = '/_ersc/assets' | `/_ersc/assets/${string}`;

const ReservedPathNamespace = '/_ersc/assets';

const InvalidStaticPath = /[:*?#]/u;

export const validateStaticPath = (path: string) => {
  if (!path.startsWith('/') || InvalidStaticPath.test(path)) {
    throw new TypeError(
      `Invalid static route path "${path}". Static routes must start with "/" and cannot contain ":", "*", "?", or "#".`,
    );
  }
};

export const validateUnreservedPath = (pathname: string) => {
  if (pathname === ReservedPathNamespace || pathname.startsWith(`${ReservedPathNamespace}/`)) {
    throw new TypeError(
      `Static route "${pathname}" uses the framework-reserved "${ReservedPathNamespace}" namespace.`,
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
