import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';

import { Application } from '../../src/application/ersc';
import {
  retainSharedLayoutContent,
  RouteOutlet,
  RouteTree,
  type RouteTreeModel,
} from '../../src/application/route-tree';

describe('RouteTree', () => {
  it('recursively renders a unary Layout ancestry', () => {
    const page: RouteTreeModel = {
      child: null,
      content: <h1>Schedule</h1>,
      id: '/schedule/day-two',
    };
    const schedule: RouteTreeModel = {
      child: page,
      content: (
        <section>
          <aside>Schedule navigation</aside>
          <RouteOutlet />
        </section>
      ),
      id: '/schedule',
    };
    const root: RouteTreeModel = {
      child: schedule,
      content: (
        <main>
          <header>Conference</header>
          <RouteOutlet />
        </main>
      ),
      id: '/',
    };

    expect(renderToStaticMarkup(<RouteTree root={root} />)).toBe(
      '<main><header>Conference</header><section><aside>Schedule navigation</aside><h1>Schedule</h1></section></main>',
    );
  });

  it('renders an intentionally empty child as null', () => {
    const root: RouteTreeModel = {
      child: null,
      content: (
        <main>
          <RouteOutlet />
        </main>
      ),
      id: '/',
    };

    expect(renderToStaticMarkup(<RouteTree root={root} />)).toBe('<main></main>');
  });

  it('rejects an outlet rendered outside a route node', () => {
    expect(() => renderToStaticMarkup(<RouteOutlet />)).toThrow(
      'RouteOutlet rendered outside its route node.',
    );
  });
});

describe('retainSharedLayoutContent', () => {
  const ERSC = Application.ersc();

  const requiredChild = (node: RouteTreeModel) => {
    if (node.child === null) {
      throw new Error(`Expected route node "${node.id}" to contain a child.`);
    }
    return node.child;
  };

  const RootLayout = ERSC.Layout.make({
    render: ({ children }) =>
      Effect.succeed(
        <html lang='en'>
          <body>{children}</body>
        </html>,
      ),
  });
  const ScheduleLayout = ERSC.Layout.make({
    render: ({ children }) =>
      Effect.succeed(
        <section>
          <aside>Schedule navigation</aside>
          {children}
        </section>,
      ),
  });
  const ScheduleLoading = ERSC.Loading.make({ render: () => <p>Loading schedule...</p> });
  const HomePage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Home</h1>) });
  const SaturdayPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Saturday</h1>) });
  const SundayPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Sunday</h1>) });

  const ConferenceApp = ERSC.make({
    routes: ERSC.Routes.make({ layout: RootLayout })
      .page('/', HomePage)
      .mount(
        '/schedule',
        ERSC.Routes.make({ layout: ScheduleLayout, loading: ScheduleLoading })
          .page('/', SaturdayPage)
          .page('/day-two', SundayPage),
      ),
  });

  const renderDestination = (pathname: `/${string}`) => ConferenceApp.renderRouteTree({ pathname });

  it('retains shared Layout content while replacing destination Loading and Page nodes', () => {
    const current = renderDestination('/schedule');
    const destination = renderDestination('/schedule/day-two');
    const currentScheduleLayout = requiredChild(current);
    const destinationScheduleLayout = requiredChild(destination);
    const destinationLoading = requiredChild(destinationScheduleLayout);

    const retained = retainSharedLayoutContent(current, destination);
    const retainedScheduleLayout = requiredChild(retained);

    expect(retained.content).toBe(current.content);
    expect(retainedScheduleLayout.content).toBe(currentScheduleLayout.content);
    expect(retainedScheduleLayout.content).not.toBe(destinationScheduleLayout.content);
    expect(retainedScheduleLayout.child).toBe(destinationLoading);
  });

  it('reveals the destination Loading boundary beneath the retained Layouts', () => {
    const current = renderDestination('/schedule');
    const destination = renderDestination('/schedule/day-two');
    const destinationLoading = requiredChild(requiredChild(destination));

    const retained = retainSharedLayoutContent(current, destination);
    const revealedLoading = requiredChild(requiredChild(retained));

    expect(revealedLoading).toBe(destinationLoading);
    expect(requiredChild(revealedLoading)).toBe(requiredChild(destinationLoading));
  });

  it('does not retain content when refreshing the same destination', () => {
    const current = renderDestination('/schedule/day-two');
    const destination = renderDestination('/schedule/day-two');

    expect(retainSharedLayoutContent(current, destination)).toBe(destination);
  });

  it('replaces the tree when a destination changes the Layout ancestry', () => {
    const current = renderDestination('/schedule/day-two');
    const destination = renderDestination('/');

    const retained = retainSharedLayoutContent(current, destination);

    expect(retained.content).toBe(current.content);
    expect(requiredChild(retained)).toBe(requiredChild(destination));
  });

  it('does not retain a Page as a Layout when both occupy the same pathname', () => {
    const NestedLayout = ERSC.Layout.make({
      render: ({ children }) => Effect.succeed(<section>{children}</section>),
    });
    const ParentPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Parent</h1>) });
    const ChildPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Child</h1>) });
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout })
        .mount('/parent', ERSC.Routes.make().page('/', ParentPage))
        .mount('/parent', ERSC.Routes.make({ layout: NestedLayout }).page('/child', ChildPage)),
    });
    const current = App.renderRouteTree({ pathname: '/parent' });
    const destination = App.renderRouteTree({ pathname: '/parent/child' });

    const retained = retainSharedLayoutContent(current, destination);

    expect(requiredChild(retained)).toBe(requiredChild(destination));
    expect(requiredChild(retained).content).not.toBe(requiredChild(current).content);
  });

  it('does not retain a different Layout scope mounted at the same prefix', () => {
    const FirstLayout = ERSC.Layout.make({
      render: ({ children }) => Effect.succeed(<section data-layout='first'>{children}</section>),
    });
    const SecondLayout = ERSC.Layout.make({
      render: ({ children }) => Effect.succeed(<section data-layout='second'>{children}</section>),
    });
    const FirstPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>First</h1>) });
    const SecondPage = ERSC.Page.make({ render: () => Effect.succeed(<h1>Second</h1>) });
    const App = ERSC.make({
      routes: ERSC.Routes.make({ layout: RootLayout })
        .mount('/shared', ERSC.Routes.make({ layout: FirstLayout }).page('/first', FirstPage))
        .mount('/shared', ERSC.Routes.make({ layout: SecondLayout }).page('/second', SecondPage)),
    });
    const current = App.renderRouteTree({ pathname: '/shared/first' });
    const destination = App.renderRouteTree({ pathname: '/shared/second' });

    const retained = retainSharedLayoutContent(current, destination);

    expect(requiredChild(retained)).toBe(requiredChild(destination));
    expect(requiredChild(retained).content).not.toBe(requiredChild(current).content);
  });
});
