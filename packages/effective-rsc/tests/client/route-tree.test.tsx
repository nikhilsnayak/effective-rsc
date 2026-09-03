import { describe, expect, it } from '@effect/vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { RouteOutlet, RouteTree } from '../../src/client/route-tree';
import type { RouteTreeModel } from '../../src/rsc/route-tree';

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
      new TypeError('RouteOutlet rendered outside its route node.'),
    );
  });
});
