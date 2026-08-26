import { describe, expect, it } from '@effect/vitest';
import { Effect, Schema, SchemaTransformation } from 'effect';

import { Application } from '../../src/application/ersc';
import type { AnyPageDefinition } from '../../src/application/page';
import type { AbsolutePath } from '../../src/application/route-path';
import type { AnyRoutes, RoutesPaths } from '../../src/application/routes';

declare const uncertainPath: '/first' | '/second';

const ERSC = Application.ersc();
const Shell = ERSC.Layout.make({
  render: ({ children }) => Effect.succeed(<main>{children}</main>),
});
const LoadingPage = ERSC.Loading.make({ render: () => <p>Loading...</p> });
const HomePage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Home</h1>) });
const HistoryPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>History</h1>) });
const DayPage = ERSC.Page.make({
  params: Schema.Struct({ day: Schema.Literals(['saturday', 'sunday']) }),
  render: ({ params }) => Effect.succeed(<h1>{params.day}</h1>),
});
const SlugPage = ERSC.Page.make({
  params: Schema.Struct({ slug: Schema.String }),
  render: ({ params }) => Effect.succeed(<h1>{params.slug}</h1>),
});
const NestedParamsPage = ERSC.Page.make({
  params: Schema.Struct({ b: Schema.String, d: Schema.String }),
  render: ({ params }) =>
    Effect.succeed(
      <h1>
        {params.b}/{params.d}
      </h1>,
    ),
});
const RenamedParamsPage = ERSC.Page.make({
  params: Schema.Struct({ slug: Schema.String }).pipe(
    Schema.decodeTo(
      Schema.Struct({ id: Schema.String }),
      SchemaTransformation.transform({
        decode: ({ slug }) => ({ id: slug }),
        encode: ({ id }) => ({ slug: id }),
      }),
    ),
  ),
  render: ({ params }) => Effect.succeed(<h1>{params.id}</h1>),
});

describe('Routes', () => {
  it('composes immutable mountable route descriptions', () => {
    const empty = ERSC.Routes.make({ layout: Shell, loading: LoadingPage });
    const notesRoutes = ERSC.Routes.make().page('/', HomePage).page('/history', HistoryPage);
    const routes = empty.mount('/notes', notesRoutes);
    const knownPath: RoutesPaths<typeof routes> = '/notes/history';

    expect(empty.paths).toEqual([]);
    expect(notesRoutes.paths).toEqual(['/', '/history']);
    expect(routes.paths).toEqual(['/notes', '/notes/history']);
    expect(knownPath).toBe('/notes/history');
    expect(Object.isFrozen(routes)).toBe(true);
    expect(Object.isFrozen(routes.paths)).toBe(true);
    expect(Object.isFrozen(notesRoutes.pages[0])).toBe(true);
    expect(Object.isFrozen(routes.mounts[0])).toBe(true);
  });

  it('infers dynamic path params from Page schemas', () => {
    const routes = ERSC.Routes.make().page('/schedule/:day', DayPage);
    const knownPath: RoutesPaths<typeof routes> = '/schedule/:day';
    const typecheckInvalidPageParams = () => {
      // @ts-expect-error A static Page cannot satisfy a dynamic route.
      ERSC.Routes.make().page('/schedule/:day', HomePage);
      // @ts-expect-error A dynamic Page cannot satisfy a static route.
      ERSC.Routes.make().page('/schedule/saturday', DayPage);
      // @ts-expect-error The Page Schema key must match the path parameter name.
      ERSC.Routes.make().page('/schedule/:day', SlugPage);
      // @ts-expect-error The internal Page adapter retains its exact raw parameter keys.
      void DayPage.component({ params: { slug: 'saturday' } });
    };

    expect(routes.paths).toEqual(['/schedule/:day']);
    expect(knownPath).toBe('/schedule/:day');
    expect(typecheckInvalidPageParams).toBeTypeOf('function');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for a parameter-free Page.
      ERSC.Routes.make().page('/schedule/:day', HomePage),
    ).toThrow('must declare a parameter Schema');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for a parameterized Page.
      ERSC.Routes.make().page('/schedule/saturday', DayPage),
    ).toThrow('requires route parameters');
  });

  it('infers every parameter across a nested route pattern', () => {
    const routes = ERSC.Routes.make().page('/a/:b/c/:d', NestedParamsPage);
    const knownPath: RoutesPaths<typeof routes> = '/a/:b/c/:d';
    const typecheckInvalidNestedParams = () => {
      // @ts-expect-error The Page Schema must contain both nested parameter names.
      ERSC.Routes.make().page('/a/:b/c/:d', DayPage);
      // @ts-expect-error Parameter names must remain unique across the complete pattern.
      ERSC.Routes.make().page('/a/:b/c/:b', NestedParamsPage);
    };

    expect(routes.paths).toEqual(['/a/:b/c/:d']);
    expect(knownPath).toBe('/a/:b/c/:d');
    expect(typecheckInvalidNestedParams).toBeTypeOf('function');
  });

  it('matches route names against the encoded Schema while rendering its decoded type', () => {
    const routes = ERSC.Routes.make().page('/:slug', RenamedParamsPage);
    const typecheckDecodedNameIsNotTheRouteName = () => {
      // @ts-expect-error Route parameters describe the Schema input, not its decoded output.
      ERSC.Routes.make().page('/:id', RenamedParamsPage);
    };

    expect(routes.paths).toEqual(['/:slug']);
    expect(typecheckDecodedNameIsNotTheRouteName).toBeTypeOf('function');
  });

  it('rejects parameter contracts whose information has been erased', () => {
    const widenedPath: AbsolutePath = '/schedule/:day';
    const forgetPageContract = (page: AnyPageDefinition<never>) => page;
    const widenedPage = forgetPageContract(HomePage);
    const widenedRoutes: AnyRoutes<never> = ERSC.Routes.make().page('/', HomePage);
    const typecheckErasedContracts = () => {
      // @ts-expect-error A widened path cannot provide exact parameter inference.
      ERSC.Routes.make().page(widenedPath, HomePage);
      // @ts-expect-error One route declaration must have one literal pattern.
      ERSC.Routes.make().page(uncertainPath, HomePage);
      // @ts-expect-error A widened Page no longer proves whether it owns parameters.
      ERSC.Routes.make().page('/', widenedPage);
      // @ts-expect-error Widened Routes no longer carry their exact mounted paths.
      ERSC.Routes.make().mount('/nested', widenedRoutes);
    };

    expect(typecheckErasedContracts).toBeTypeOf('function');
  });

  it('requires a finite, non-empty Schema of string-encoded path parameters', () => {
    const unknownInputPage = ERSC.Page.make({
      params: Schema.Struct({ value: Schema.Unknown }),
      render: ({ params }) => Effect.succeed(<h1>{typeof params.value}</h1>),
    });
    const routes = ERSC.Routes.make().page('/:value', unknownInputPage);
    const typecheckInvalidSchemas = () => {
      // @ts-expect-error An empty parameter Schema cannot match a parameterized path.
      ERSC.Page.make({ params: Schema.Struct({}), render: () => Effect.succeed(null) });
      ERSC.Page.make({
        // @ts-expect-error A record Schema has no finite parameter-name set.
        params: Schema.Record(Schema.String, Schema.String),
        render: () => Effect.succeed(null),
      });
      ERSC.Page.make({
        // @ts-expect-error Effect HTTP captures path parameters as strings.
        params: Schema.Struct({ count: Schema.Finite }),
        render: () => Effect.succeed(null),
      });
      ERSC.Page.make({
        // @ts-expect-error Schema keys must be valid Effect HTTP parameter names.
        params: Schema.Struct({ 'invalid-name': Schema.String }),
        render: () => Effect.succeed(null),
      });
    };

    expect(routes.paths).toEqual(['/:value']);
    expect(typecheckInvalidSchemas).toBeTypeOf('function');
  });

  it('rejects invalid and reserved route paths at the type and runtime boundaries', () => {
    const typecheckInvalidPaths = () => {
      // @ts-expect-error Dynamic params must occupy a complete path segment.
      ERSC.Routes.make().page('/users/user:userId', HomePage);
      // @ts-expect-error Dynamic parameter names must be unique.
      ERSC.Routes.make().page('/users/:userId/:userId', HomePage);
      // @ts-expect-error Route definitions must use canonical non-trailing slashes.
      ERSC.Routes.make().page('/users/', HomePage);
      // @ts-expect-error Route definitions cannot contain empty segments.
      ERSC.Routes.make().page('/users//history', HomePage);
      // @ts-expect-error Route definitions cannot contain URL-normalized dot segments.
      ERSC.Routes.make().page('/users/../history', HomePage);
      // @ts-expect-error Route definitions use decoded path text, not percent escapes.
      ERSC.Routes.make().page('/users/%61', HomePage);
      // @ts-expect-error Dynamic mount prefixes are not part of this checkpoint.
      ERSC.Routes.make().mount('/:group', ERSC.Routes.make().page('/', HomePage));
      ERSC.make({
        // @ts-expect-error The final application path uses the framework asset namespace.
        routes: ERSC.Routes.make({ layout: Shell }).page('/_ersc/assets/example', HomePage),
      });
      ERSC.make({
        // @ts-expect-error A parameterized pattern can match the framework asset namespace.
        routes: ERSC.Routes.make({ layout: Shell }).page('/:slug/assets', SlugPage),
      });
    };
    expect(typecheckInvalidPaths).toBeTypeOf('function');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for malformed dynamic syntax.
      ERSC.Routes.make().page('/users/user:userId', HomePage),
    ).toThrow('Dynamic segments must use the ":parameter" convention');
    expect(() =>
      // @ts-expect-error Exercise canonical-path runtime validation.
      ERSC.Routes.make().page('/users/', HomePage),
    ).toThrow('cannot contain empty, ".", or ".." segments or end with "/"');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for a dynamic mount prefix.
      ERSC.Routes.make().mount('/:group', ERSC.Routes.make().page('/', HomePage)),
    ).toThrow('Routes cannot be mounted beneath parameterized path "/:group".');
    expect(() =>
      ERSC.make({
        // @ts-expect-error Exercise runtime validation for the reserved asset namespace.
        routes: ERSC.Routes.make({ layout: Shell }).page('/_ersc/assets/example', HomePage),
      }),
    ).toThrow('uses the framework-reserved "/_ersc/assets" namespace');
    expect(() =>
      ERSC.make({
        // @ts-expect-error Exercise overlap detection for a parameterized reserved route.
        routes: ERSC.Routes.make({ layout: Shell }).page('/:slug/assets', SlugPage),
      }),
    ).toThrow('uses the framework-reserved "/_ersc/assets" namespace');
  });

  it('rejects duplicate paths introduced locally or by a mount', () => {
    const homeRoutes = ERSC.Routes.make().page('/', HomePage);
    const typecheckDuplicatePaths = () => {
      // @ts-expect-error A local page cannot replace an existing page.
      homeRoutes.page('/', HistoryPage);
      // @ts-expect-error Mounted paths cannot collide with existing paths.
      homeRoutes.mount('/', ERSC.Routes.make().page('/', HistoryPage));
    };

    expect(typecheckDuplicatePaths).toBeTypeOf('function');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for a duplicate local path.
      homeRoutes.page('/', HistoryPage),
    ).toThrow('Route "/" conflicts with an existing route pattern.');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for a duplicate mounted path.
      homeRoutes.mount('/', ERSC.Routes.make().page('/', HistoryPage)),
    ).toThrow('Route "/" conflicts with an existing route pattern.');

    const dynamicRoutes = ERSC.Routes.make().page('/:day', DayPage);
    expect(() =>
      // @ts-expect-error Renaming a parameter does not create a distinct route pattern.
      dynamicRoutes.page('/:slug', SlugPage),
    ).toThrow('Route "/:slug" conflicts with an existing route pattern.');

    const caseInsensitiveRoutes = ERSC.Routes.make().page('/Schedule', HomePage);
    expect(() =>
      // @ts-expect-error Effect HTTP matches static path segments case-insensitively.
      caseInsensitiveRoutes.page('/schedule', HistoryPage),
    ).toThrow('Route "/schedule" conflicts with an existing route pattern.');
  });

  it('rejects mounting Routes that contain no pages', () => {
    const emptyRoutes = ERSC.Routes.make({ layout: Shell });
    const typecheckEmptyMount = () => {
      // @ts-expect-error Empty Routes do not contribute an application destination.
      ERSC.Routes.make().mount('/empty', emptyRoutes);
    };

    expect(typecheckEmptyMount).toBeTypeOf('function');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for an empty mounted route collection.
      ERSC.Routes.make().mount('/empty', emptyRoutes),
    ).toThrow('Cannot mount empty Routes at "/empty".');
  });
});
