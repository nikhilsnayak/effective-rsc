import { describe, expect, it } from '@effect/vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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
    expect(() => renderToStaticMarkup(<RouteOutlet />)).toThrowError(
      'RouteOutlet rendered outside its route node.',
    );
  });

  it('retains shared Layout content while replacing destination Loading and Page nodes', () => {
    const currentPage: RouteTreeModel = {
      child: null,
      content: <h1>Saturday</h1>,
      id: '/',
    };
    const currentLoading: RouteTreeModel = {
      child: currentPage,
      content: <RouteOutlet />,
      id: '/',
    };
    const currentLayout: RouteTreeModel = {
      child: currentLoading,
      content: <RouteOutlet />,
      id: '/schedule',
    };
    const currentRoot: RouteTreeModel = {
      child: currentLayout,
      content: <RouteOutlet />,
      id: '/',
    };
    const destinationPage: RouteTreeModel = {
      child: null,
      content: <h1>Sunday</h1>,
      id: '/schedule/day-two',
    };
    const destinationLoading: RouteTreeModel = {
      child: destinationPage,
      content: <RouteOutlet />,
      id: '/schedule/day-two',
    };
    const destinationLayout: RouteTreeModel = {
      child: destinationLoading,
      content: <RouteOutlet />,
      id: '/schedule',
    };
    const destinationRoot: RouteTreeModel = {
      child: destinationLayout,
      content: <RouteOutlet />,
      id: '/',
    };

    const retained = retainSharedLayoutContent(currentRoot, destinationRoot);
    const retainedLayout = retained.child;

    expect(retained.content).toBe(currentRoot.content);
    expect(retainedLayout?.content).toBe(currentLayout.content);
    expect(retainedLayout?.child).toBe(destinationLoading);
  });

  it('does not retain content when refreshing the same destination', () => {
    const current: RouteTreeModel = {
      child: null,
      content: <h1>Before refresh</h1>,
      id: '/',
    };
    const destination: RouteTreeModel = {
      child: null,
      content: <h1>After refresh</h1>,
      id: '/',
    };

    expect(retainSharedLayoutContent(current, destination)).toBe(destination);
  });
});
