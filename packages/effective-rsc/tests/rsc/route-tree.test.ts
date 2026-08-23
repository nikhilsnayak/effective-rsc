import { describe, expect, it } from '@effect/vitest';

import {
  overlayRouteTree,
  RouteDataPatch,
  stripRouteTreeData,
  type RouteTree,
  type RouteTreePatch,
} from '../../src/rsc/route-tree';

const makeDestinationShell = (): RouteTree<string> => ({
  key: 'layout:root',
  data: 'conference layout',
  hasLoadingBoundary: false,
  slots: {
    children: {
      key: 'page:/schedule/day-two',
      data: 'loading Sunday schedule',
      hasLoadingBoundary: true,
      slots: {},
    },
    modal: null,
    sidebar: {
      key: 'slot:sidebar',
      data: 'conference tracks',
      hasLoadingBoundary: false,
      slots: {},
    },
  },
});

describe('RSC route-tree model', () => {
  it('retains reusable topology without retaining rendered segment data', () => {
    expect(stripRouteTreeData(makeDestinationShell())).toEqual({
      key: 'layout:root',
      data: null,
      hasLoadingBoundary: false,
      slots: {
        children: {
          key: 'page:/schedule/day-two',
          data: null,
          hasLoadingBoundary: true,
          slots: {},
        },
        modal: null,
        sidebar: {
          key: 'slot:sidebar',
          data: null,
          hasLoadingBoundary: false,
          slots: {},
        },
      },
    });
  });

  it('overlays selected branch data while retaining untouched parallel branches', () => {
    const shell = makeDestinationShell();
    const sidebar = shell.slots['sidebar'];
    const patch: RouteTreePatch<string> = {
      key: 'layout:root',
      data: RouteDataPatch.preserve,
      slots: {
        children: {
          key: 'page:/schedule/day-two',
          data: RouteDataPatch.replace('Sunday schedule'),
          slots: {},
        },
      },
    };

    const result = overlayRouteTree(shell, patch);

    expect(result.data).toBe('conference layout');
    expect(result.slots['children']?.data).toBe('Sunday schedule');
    expect(result.slots['children']?.hasLoadingBoundary).toBe(true);
    expect(result.slots['sidebar']).toBe(sidebar);
    expect(result.slots['modal']).toBeNull();
  });

  it('rejects an overlay for a different route topology', () => {
    const patch: RouteTreePatch<string> = {
      key: 'layout:other',
      data: RouteDataPatch.preserve,
      slots: {},
    };

    expect(() => overlayRouteTree(makeDestinationShell(), patch)).toThrowError(
      'Cannot overlay route node "layout:other" onto route node "layout:root".',
    );
  });
});
