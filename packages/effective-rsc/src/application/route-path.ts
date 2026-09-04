export type AbsolutePath = `/${string}`;

// Compile-time and runtime route grammars are deliberately paired. Any grammar change must update
// both ValidRoutePath/ValidRouteParamName and analyzeRoutePath, with one paired type/runtime test.
type InvalidRouteCharacter = '*' | '?' | '#' | '%' | ';' | '\\';
type InvalidParameterCharacter = InvalidRouteCharacter | '/' | ':' | '(' | ')' | '.' | '-';

export type ValidRouteParamName<Name extends string> = string extends Name
  ? never
  : Name extends ''
    ? never
    : Name extends `${string}${InvalidParameterCharacter}${string}`
      ? never
      : Name;

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

type ValidRouteSegments<
  Segments extends string,
  Seen extends string = never,
> = string extends Segments
  ? false
  : Segments extends `${infer Segment}/${infer Rest}`
    ? Segment extends '' | '.' | '..'
      ? false
      : Segment extends `:${infer Parameter}`
        ? Parameter extends ''
          ? false
          : Parameter extends `${string}${InvalidParameterCharacter}${string}`
            ? false
            : Parameter extends Seen
              ? false
              : ValidRouteSegments<Rest, Seen | Parameter>
        : Segment extends `${string}:${string}`
          ? false
          : ValidRouteSegments<Rest, Seen>
    : Segments extends '' | '.' | '..'
      ? false
      : Segments extends `:${infer Parameter}`
        ? Parameter extends ''
          ? false
          : Parameter extends `${string}${InvalidParameterCharacter}${string}`
            ? false
            : Parameter extends Seen
              ? false
              : true
        : Segments extends `${string}:${string}`
          ? false
          : true;

export type ValidRoutePath<Path extends AbsolutePath> =
  true extends IsUnion<Path>
    ? never
    : Path extends '/'
      ? Path
      : Path extends `${string}${InvalidRouteCharacter}${string}`
        ? never
        : Path extends `/${infer Segments}`
          ? ValidRouteSegments<Segments> extends true
            ? Path
            : never
          : never;

type RouteParamNamesFromSegments<Segments extends string> =
  Segments extends `${infer Segment}/${infer Rest}`
    ?
        | (Segment extends `:${infer Parameter}` ? Parameter : never)
        | RouteParamNamesFromSegments<Rest>
    : Segments extends `:${infer Parameter}`
      ? Parameter
      : never;

export type RouteParamNames<Path extends AbsolutePath> = Path extends `/${infer Segments}`
  ? RouteParamNamesFromSegments<Segments>
  : never;

type RouteShapeSegments<Segments extends string> = Segments extends `${infer Segment}/${infer Rest}`
  ? `${Segment extends `:${string}` ? ':' : Segment}/${RouteShapeSegments<Rest>}`
  : Segments extends `:${string}`
    ? ':'
    : Segments;

export type RouteShape<Path extends AbsolutePath> = Path extends `/${infer Segments}`
  ? Lowercase<`/${RouteShapeSegments<Segments>}`>
  : never;

export type JoinPath<Prefix extends AbsolutePath, Path extends AbsolutePath> = Prefix extends '/'
  ? Path
  : Path extends '/'
    ? Prefix
    : `${Prefix}${Path}`;

export const FrameworkNamespace = '/_ersc';

export const FrameworkAssetNamespace = `${FrameworkNamespace}/assets`;

export const FrameworkAssetPrefix = `${FrameworkAssetNamespace}/` as const;

type SegmentCanMatch<Segment extends string, Expected extends string> = Segment extends `:${string}`
  ? true
  : Lowercase<Segment> extends Expected
    ? true
    : false;

type MatchesReservedSegments<Segments extends string> = Segments extends `${infer First}/${string}`
  ? SegmentCanMatch<First, '_ersc'>
  : SegmentCanMatch<Segments, '_ersc'>;

export type ReservedRoutePath<Path extends AbsolutePath> = Path extends `/${infer Segments}`
  ? MatchesReservedSegments<Segments> extends true
    ? Path
    : never
  : never;

const InvalidRoutePath = /[*?#%;\\]/u;
const DynamicSegment = /^:([^:().-]+)$/u;

type RouteAnalysis =
  | {
      readonly _tag: 'ParameterFree';
      readonly shape: string;
    }
  | {
      readonly _tag: 'Parameterized';
      readonly parameterNames: readonly [string, ...Array<string>];
      readonly shape: string;
    };

export const analyzeRoutePath = (path: string): RouteAnalysis => {
  if (!path.startsWith('/') || InvalidRoutePath.test(path)) {
    throw new TypeError(
      `Invalid route path "${path}". Route paths must start with "/" and cannot contain "*", "?", "#", "%", ";", or "\\".`,
    );
  }

  const segments = path === '/' ? [] : path.slice(1).split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(
      `Invalid route path "${path}". Route paths cannot contain empty, ".", or ".." segments or end with "/".`,
    );
  }

  const parameterNames = new Set<string>();
  const shapeSegments: Array<string> = [];
  for (const segment of segments) {
    if (!segment.includes(':')) {
      shapeSegments.push(segment.toLowerCase());
      continue;
    }

    const match = DynamicSegment.exec(segment);
    if (match === null) {
      throw new TypeError(
        `Invalid route path "${path}". Dynamic segments must use the ":parameter" convention.`,
      );
    }

    const parameterName = match[1];
    if (parameterName === undefined || parameterNames.has(parameterName)) {
      throw new TypeError(
        `Invalid route path "${path}". Dynamic parameter names must be unique within a route.`,
      );
    }

    parameterNames.add(parameterName);
    shapeSegments.push(':');
  }

  const shape = `/${shapeSegments.join('/')}`;
  const parameters = parameterNames.values();
  const firstParameter = parameters.next();
  return firstParameter.done
    ? { _tag: 'ParameterFree', shape }
    : {
        _tag: 'Parameterized',
        parameterNames: Object.freeze([firstParameter.value, ...parameters]),
        shape,
      };
};

export const validateUnreservedPath = (path: string) => {
  const segments = path.slice(1).split('/');
  const canMatch = (segment: string | undefined, expected: string) =>
    segment?.startsWith(':') === true || segment?.toLowerCase() === expected;
  if (canMatch(segments[0], '_ersc')) {
    throw new TypeError(
      `Route "${path}" uses the framework-reserved "${FrameworkNamespace}" namespace.`,
    );
  }
};

export const joinRoutePaths = (prefix: AbsolutePath, path: AbsolutePath): AbsolutePath => {
  if (prefix === '/') {
    return path;
  }
  if (path === '/') {
    return prefix;
  }
  return `${prefix}${path}`;
};

export const isAbsolutePath = (value: string): value is AbsolutePath => value.startsWith('/');
