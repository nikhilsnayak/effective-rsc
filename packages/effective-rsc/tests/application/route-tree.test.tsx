import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';

import { Application } from '../../src/application/definition';
import { Layout, type LayoutProps } from '../../src/application/layout';
import { Loading } from '../../src/application/loading';
import { Page } from '../../src/application/page';
import type { RenderRuntime } from '../../src/application/render-runtime';
import {
  retainSharedLayoutContent,
  RouteOutlet,
  RouteTree,
  type RouteTreeModel,
} from '../../src/application/route-tree';
import { Routes } from '../../src/application/routes';

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
    expect(() => renderToStaticMarkup(<RouteOutlet />)).toThrowError(
      'RouteOutlet rendered outside its route node.',
    );
  });
});

describe('retainSharedLayoutContent', () => {
  const runtime: RenderRuntime<never> = (effect) => Effect.runPromise(effect);

  const requiredChild = (node: RouteTreeModel) => {
    if (node.child === null) {
      throw new Error(`Expected route node "${node.id}" to contain a child.`);
    }
    return node.child;
  };

  const RootLayout = Layout.make({
    render: ({ children }: LayoutProps) =>
      Effect.succeed(
        <html lang='en'>
          <body>{children}</body>
        </html>,
      ),
  });
  const ScheduleLayout = Layout.make({
    render: ({ children }: LayoutProps) =>
      Effect.succeed(
        <section>
          <aside>Schedule navigation</aside>
          {children}
        </section>,
      ),
  });
  const ScheduleLoading = Loading.make(() => <p>Loading schedule...</p>);
  const HomePage = Page.make(() => Effect.succeed(<h1>Home</h1>));
  const SaturdayPage = Page.make(() => Effect.succeed(<h1>Saturday</h1>));
  const SundayPage = Page.make(() => Effect.succeed(<h1>Sunday</h1>));

  const ConferenceApp = Application.make({
    routes: Routes.make({ layout: RootLayout })
      .page('/', HomePage)
      .mount(
        '/schedule',
        Routes.make({ layout: ScheduleLayout, loading: ScheduleLoading })
          .page('/', SaturdayPage)
          .page('/day-two', SundayPage),
      ),
  });

  const renderDestination = (pathname: `/${string}`) =>
    ConferenceApp.renderRouteTree({ pathname, runtime });

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

    const retained = retainSharedLayoutContent(current, destination);
    const revealedLoading = requiredChild(requiredChild(retained));

    expect(revealedLoading.id).toBe('/schedule/day-two');
    expect(requiredChild(revealedLoading).id).toBe('/schedule/day-two');
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
});
