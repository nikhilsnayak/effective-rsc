import { describe, expect, it } from '@effect/vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RouteOutlet, RouteTree, type RouteRenderData } from '../../src/application/route-tree';
import type { RouteTree as RouteTreeModel } from '../../src/rsc/route-tree';

const renderData = (content: ReactNode): RouteRenderData => ({ content, loading: null });

describe('RouteTree', () => {
  it('recursively stitches named sibling slots and preserves intentional empty slots', () => {
    const details: RouteTreeModel<RouteRenderData> = {
      key: 'details',
      data: renderData(<p key='details'>Details</p>),
      hasLoadingBoundary: false,
      slots: {},
    };
    const main: RouteTreeModel<RouteRenderData> = {
      key: 'main',
      data: renderData(
        <main key='main'>
          <RouteOutlet name='details' />
        </main>,
      ),
      hasLoadingBoundary: false,
      slots: { details },
    };
    const sidebar: RouteTreeModel<RouteRenderData> = {
      key: 'sidebar',
      data: renderData(<aside key='sidebar'>Sidebar</aside>),
      hasLoadingBoundary: false,
      slots: {},
    };
    const root: RouteTreeModel<RouteRenderData> = {
      key: 'root',
      data: renderData(
        <div key='root'>
          <RouteOutlet name='children' />
          <RouteOutlet name='sidebar' />
          <RouteOutlet name='modal' />
        </div>,
      ),
      hasLoadingBoundary: false,
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
    const root: RouteTreeModel<RouteRenderData> = {
      key: 'root',
      data: renderData(<RouteOutlet key='missing' name='missing' />),
      hasLoadingBoundary: false,
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
