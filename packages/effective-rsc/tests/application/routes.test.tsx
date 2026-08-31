import { describe, expect, it } from '@effect/vitest';
import { Effect, Schema, SchemaTransformation } from 'effect';

import { Application } from '../../src/application/ersc';
import { getRoutesState } from '../../src/application/routes';

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
  it('captures immutable middleware scopes from a derived ERSC view', () => {
    const First = ERSC.Middleware.make((httpEffect) => httpEffect);
    const Second = ERSC.Middleware.make((httpEffect) => httpEffect);
    const FirstScope = ERSC.withMiddleware(First);
    const SecondScope = FirstScope.withMiddleware(Second);
    const routes = SecondScope.Routes.make();
    expect(getRoutesState(routes).middleware).toEqual([First, Second]);
    expect(Object.isFrozen(First)).toBe(true);
    expect(Object.isFrozen(getRoutesState(routes).middleware)).toBe(true);
    expect(() => FirstScope.withMiddleware(First)).toThrow('cannot appear twice in the same scope');
    const OtherERSC = Application.ersc();
    const OtherMiddleware = OtherERSC.Middleware.make((httpEffect) => httpEffect);
    expect(() => ERSC.withMiddleware(OtherMiddleware)).toThrow(
      'created by a different ERSC module',
    );
  });

  it('composes immutable mountable route descriptions', () => {
    const empty = ERSC.Routes.make({ layout: Shell, loading: LoadingPage });
    const notesRoutes = ERSC.Routes.make().page('/', HomePage).page('/history', HistoryPage);
    const routes = empty.mount('/notes', notesRoutes);
    expect(getRoutesState(empty).paths).toEqual([]);
    expect(getRoutesState(notesRoutes).paths).toEqual(['/', '/history']);
    expect(getRoutesState(routes).paths).toEqual(['/notes', '/notes/history']);
    expect(Object.isFrozen(routes)).toBe(true);
    expect(Object.isFrozen(getRoutesState(routes).paths)).toBe(true);
    expect(Object.isFrozen(getRoutesState(notesRoutes).pages[0])).toBe(true);
    expect(Object.isFrozen(getRoutesState(routes).mounts[0])).toBe(true);
  });

  it('infers dynamic path params from Page schemas', () => {
    const routes = ERSC.Routes.make().page('/schedule/:day', DayPage);
    expect(getRoutesState(routes).paths).toEqual(['/schedule/:day']);
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
    expect(getRoutesState(routes).paths).toEqual(['/a/:b/c/:d']);
  });

  it('matches route names against the encoded Schema while rendering its decoded type', () => {
    const routes = ERSC.Routes.make().page('/:slug', RenamedParamsPage);
    expect(getRoutesState(routes).paths).toEqual(['/:slug']);
  });

  it('requires a finite, non-empty Schema of string-encoded path parameters', () => {
    const unknownInputPage = ERSC.Page.make({
      params: Schema.Struct({ value: Schema.Unknown }),
      render: ({ params }) => Effect.succeed(<h1>{typeof params.value}</h1>),
    });
    const routes = ERSC.Routes.make().page('/:value', unknownInputPage);
    expect(getRoutesState(routes).paths).toEqual(['/:value']);
  });

  it('rejects invalid and reserved route paths at the type and runtime boundaries', () => {
    expect(() =>
      // @ts-expect-error Exercise runtime validation for malformed dynamic syntax.
      ERSC.Routes.make().page('/users/user:userId', HomePage),
    ).toThrow('Dynamic segments must use the ":parameter" convention');
    expect(() =>
      // @ts-expect-error Exercise canonical-path runtime validation.
      ERSC.Routes.make().page('/users/', HomePage),
    ).toThrow('cannot contain empty, ".", or ".." segments or end with "/"');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for empty segments.
      ERSC.Routes.make().page('/users//history', HomePage),
    ).toThrow('cannot contain empty, ".", or ".." segments or end with "/"');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for URL-normalized dot segments.
      ERSC.Routes.make().page('/users/../history', HomePage),
    ).toThrow('cannot contain empty, ".", or ".." segments or end with "/"');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for percent escapes.
      ERSC.Routes.make().page('/users/%61', HomePage),
    ).toThrow('cannot contain "*", "?", "#", "%", ";", or "\\"');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for duplicate parameter names.
      ERSC.Routes.make().page('/users/:userId/:userId', HomePage),
    ).toThrow('Dynamic parameter names must be unique within a route');
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
    expect(() =>
      // @ts-expect-error Exercise runtime validation for an empty mounted route collection.
      ERSC.Routes.make().mount('/empty', emptyRoutes),
    ).toThrow('Cannot mount empty Routes at "/empty".');
  });
});
