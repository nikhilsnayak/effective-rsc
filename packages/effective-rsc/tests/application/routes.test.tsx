import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { Application } from '../../src/application/definition';
import { Layout } from '../../src/application/layout';
import { Loading } from '../../src/application/loading';
import { Page } from '../../src/application/page';
import { Routes, type RoutesPaths } from '../../src/application/routes';

const Shell = Layout.make({
  render: ({ children }) => Effect.succeed(<main>{children}</main>),
});
const LoadingPage = Loading.make(() => <p>Loading...</p>);
const HomePage = Page.make(() => Effect.succeed(<h1>Home</h1>));
const HistoryPage = Page.make(() => Effect.succeed(<h1>History</h1>));

describe('Routes', () => {
  it('composes immutable mountable route descriptions', () => {
    const empty = Routes.make({ layout: Shell, loading: LoadingPage });
    const notesRoutes = Routes.make().page('/', HomePage).page('/history', HistoryPage);
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
      Routes.make().page('/users/:userId', HomePage);
      Application.make({
        // @ts-expect-error The final application path uses the framework asset namespace.
        routes: Routes.make({ layout: Shell }).page('/_ersc/assets/example', HomePage),
      });
    };
    const dynamicPath = '/users/:userId' as '/users';
    const reservedPath = '/_ersc/assets/example' as '/assets';

    expect(typecheckInvalidPaths).toBeTypeOf('function');
    expect(() => Routes.make().page(dynamicPath, HomePage)).toThrowError(
      'Invalid static route path "/users/:userId"',
    );
    expect(() =>
      Application.make({
        routes: Routes.make({ layout: Shell }).page(reservedPath, HomePage) as never,
      }),
    ).toThrowError('uses the framework-reserved "/_ersc/assets" namespace');
  });

  it('rejects duplicate paths introduced locally or by a mount', () => {
    const homeRoutes = Routes.make().page('/', HomePage);
    const typecheckDuplicatePaths = () => {
      // @ts-expect-error A local page cannot replace an existing page.
      homeRoutes.page('/', HistoryPage);
      // @ts-expect-error Mounted paths cannot collide with existing paths.
      homeRoutes.mount('/', Routes.make().page('/', HistoryPage));
    };

    expect(typecheckDuplicatePaths).toBeTypeOf('function');
    expect(() => homeRoutes.page('/' as never, HistoryPage)).toThrowError(
      'Static route "/" is declared more than once.',
    );
    expect(() =>
      homeRoutes.mount('/' as never, Routes.make().page('/', HistoryPage) as never),
    ).toThrowError('Static route "/" is declared more than once.');
  });

  it('rejects mounting Routes that contain no pages', () => {
    const emptyRoutes = Routes.make({ layout: Shell });
    const typecheckEmptyMount = () => {
      // @ts-expect-error Empty Routes do not contribute an application destination.
      Routes.make().mount('/empty', emptyRoutes);
    };

    expect(typecheckEmptyMount).toBeTypeOf('function');
    expect(() => Routes.make().mount('/empty', emptyRoutes as never)).toThrowError(
      'Cannot mount empty Routes at "/empty".',
    );
  });
});
