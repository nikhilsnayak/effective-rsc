import { describe, expect, it } from '@effect/vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { RouteOutlet, RouteTree, type RouteNode } from '../../src/application/route-tree';

describe('RouteTree', () => {
  it('recursively stitches named sibling slots and preserves intentional empty slots', () => {
    const details: RouteNode = {
      id: 'details',
      element: <p key='details'>Details</p>,
      slots: {},
    };
    const main: RouteNode = {
      id: 'main',
      element: (
        <main key='main'>
          <RouteOutlet name='details' />
        </main>
      ),
      slots: { details },
    };
    const sidebar: RouteNode = {
      id: 'sidebar',
      element: <aside key='sidebar'>Sidebar</aside>,
      slots: {},
    };
    const root: RouteNode = {
      id: 'root',
      element: (
        <div key='root'>
          <RouteOutlet name='children' />
          <RouteOutlet name='sidebar' />
          <RouteOutlet name='modal' />
        </div>
      ),
      slots: {
        children: main,
        modal: null,
        sidebar,
      },
    };

    expect(renderToStaticMarkup(<RouteTree root={root} />)).toBe(
      '<div><main><p>Details</p></main><aside>Sidebar</aside></div>',
    );
  });

  it('rejects a slot that its route node does not declare', () => {
    const root: RouteNode = {
      id: 'root',
      element: <RouteOutlet key='missing' name='missing' />,
      slots: {},
    };

    expect(() => renderToStaticMarkup(<RouteTree root={root} />)).toThrowError(
      'Route node "root" does not declare slot "missing".',
    );
  });

  it('rejects a slot rendered outside a route node', () => {
    expect(() => renderToStaticMarkup(<RouteOutlet name='children' />)).toThrowError(
      'Route slot "children" rendered outside its route node.',
    );
  });
});
