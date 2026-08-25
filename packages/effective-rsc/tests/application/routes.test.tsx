import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { Application } from '../../src/application/ersc';
import type { RoutesPaths } from '../../src/application/routes';

const ERSC = Application.ersc();
const Shell = ERSC.Layout.make({
  render: ({ children }) => Effect.succeed(<main>{children}</main>),
});
const LoadingPage = ERSC.Loading.make({ render: () => <p>Loading...</p> });
const HomePage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Home</h1>) });
const HistoryPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>History</h1>) });

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
  });

  it('rejects invalid and reserved static paths at the type and runtime boundaries', () => {
    const typecheckInvalidPaths = () => {
      // @ts-expect-error Dynamic path syntax is not part of the static-route checkpoint.
      ERSC.Routes.make().page('/users/:userId', HomePage);
      ERSC.make({
        // @ts-expect-error The final application path uses the framework asset namespace.
        routes: ERSC.Routes.make({ layout: Shell }).page('/_ersc/assets/example', HomePage),
      });
    };
    expect(typecheckInvalidPaths).toBeTypeOf('function');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for dynamic syntax.
      ERSC.Routes.make().page('/users/:userId', HomePage),
    ).toThrow('Invalid static route path "/users/:userId"');
    expect(() =>
      ERSC.make({
        // @ts-expect-error Exercise runtime validation for the reserved asset namespace.
        routes: ERSC.Routes.make({ layout: Shell }).page('/_ersc/assets/example', HomePage),
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
    ).toThrow('Static route "/" is declared more than once.');
    expect(() =>
      // @ts-expect-error Exercise runtime validation for a duplicate mounted path.
      homeRoutes.mount('/', ERSC.Routes.make().page('/', HistoryPage)),
    ).toThrow('Static route "/" is declared more than once.');
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
