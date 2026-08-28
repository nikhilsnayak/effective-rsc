import type { RouteTreeModel } from '../rsc/route-tree';
import { retainSharedLayoutContent } from './route-tree';

export type BrowserRootNavigation = {
  readonly committed: Promise<void>;
  readonly complete: () => void;
  readonly rollback: () => Promise<void>;
};

export type BrowserRootController = {
  readonly navigate: (routeTree: RouteTreeModel) => BrowserRootNavigation;
  readonly refresh: (routeTree: RouteTreeModel) => Promise<void>;
};

type BrowserNavigationState = {
  readonly committed: PromiseWithResolvers<void>;
  readonly retired: PromiseWithResolvers<void>;
  readonly routeTree: RouteTreeModel;
  readonly stableRouteTree: RouteTreeModel;
};

type BrowserNavigationPhase =
  | 'Scheduled'
  | 'Visible'
  | 'RollbackRequested'
  | 'Completed'
  | 'Retired';

type BrowserNavigationOwner =
  | { readonly _tag: 'Stable' }
  | { readonly _tag: 'Navigation'; readonly navigation: BrowserNavigationState };

type BrowserLifecycle = {
  active: BrowserNavigationOwner;
  readonly phases: WeakMap<BrowserNavigationState, BrowserNavigationPhase>;
  retiring: ReadonlyArray<BrowserNavigationState>;
  stableRouteTree: RouteTreeModel;
  visible: BrowserNavigationOwner;
};

export type BrowserRender =
  | { readonly _tag: 'Initial'; readonly routeTree: RouteTreeModel }
  | {
      readonly _tag: 'Navigation';
      readonly navigation: BrowserNavigationState;
      readonly routeTree: RouteTreeModel;
    }
  | {
      readonly _tag: 'Refresh';
      readonly committed: PromiseWithResolvers<void>;
      readonly routeTree: RouteTreeModel;
    }
  | {
      readonly _tag: 'Rollback';
      readonly navigation: BrowserNavigationState;
      readonly routeTree: RouteTreeModel;
    };

const getNavigationPhase = (lifecycle: BrowserLifecycle, navigation: BrowserNavigationState) => {
  const phase = lifecycle.phases.get(navigation);
  if (phase === undefined) {
    throw new TypeError('Browser navigation does not belong to this root.');
  }
  return phase;
};

const retireNavigation = (lifecycle: BrowserLifecycle, navigation: BrowserNavigationState) => {
  if (getNavigationPhase(lifecycle, navigation) !== 'Retired') {
    lifecycle.phases.set(navigation, 'Retired');
    navigation.retired.resolve();
  }
};

export const makeBrowserRenderer = (
  initialRouteTree: RouteTreeModel,
  publish: (render: BrowserRender) => void,
) => {
  const lifecycle: BrowserLifecycle = {
    active: { _tag: 'Stable' },
    phases: new WeakMap(),
    retiring: [],
    stableRouteTree: initialRouteTree,
    visible: { _tag: 'Stable' },
  };

  const controller: BrowserRootController = {
    navigate: (routeTree) => {
      const navigation: BrowserNavigationState = {
        committed: Promise.withResolvers<void>(),
        retired: Promise.withResolvers<void>(),
        routeTree: retainSharedLayoutContent(lifecycle.stableRouteTree, routeTree),
        stableRouteTree: lifecycle.stableRouteTree,
      };
      lifecycle.phases.set(navigation, 'Scheduled');
      lifecycle.active = { _tag: 'Navigation', navigation };
      publish({ _tag: 'Navigation', navigation, routeTree: navigation.routeTree });

      return {
        committed: navigation.committed.promise,
        complete: () => {
          const active = lifecycle.active;
          if (active._tag === 'Navigation' && active.navigation === navigation) {
            lifecycle.active = { _tag: 'Stable' };
            lifecycle.stableRouteTree = navigation.routeTree;
            lifecycle.phases.set(navigation, 'Completed');
          }
        },
        rollback: () => {
          switch (getNavigationPhase(lifecycle, navigation)) {
            case 'Completed':
            case 'Retired':
              return Promise.resolve();
            case 'Scheduled':
            case 'Visible':
              lifecycle.phases.set(navigation, 'RollbackRequested');
              break;
            case 'RollbackRequested':
              return navigation.retired.promise;
          }

          const active = lifecycle.active;
          const visible = lifecycle.visible;
          if (
            active._tag === 'Navigation' ||
            (visible._tag === 'Navigation' && visible.navigation === navigation)
          ) {
            lifecycle.retiring = [...lifecycle.retiring, navigation];
          } else {
            retireNavigation(lifecycle, navigation);
          }
          if (active._tag === 'Navigation' && active.navigation === navigation) {
            lifecycle.active = { _tag: 'Stable' };
            publish({
              _tag: 'Rollback',
              navigation,
              routeTree: navigation.stableRouteTree,
            });
          }
          return navigation.retired.promise;
        },
      };
    },
    refresh: (routeTree) => {
      const committed = Promise.withResolvers<void>();
      lifecycle.active = { _tag: 'Stable' };
      publish({ _tag: 'Refresh', committed, routeTree });
      return committed.promise;
    },
  };

  const commit = (render: BrowserRender) => {
    const visible: BrowserNavigationOwner =
      render._tag === 'Navigation'
        ? { _tag: 'Navigation', navigation: render.navigation }
        : { _tag: 'Stable' };
    lifecycle.visible = visible;

    lifecycle.retiring = lifecycle.retiring.filter((navigation) => {
      if (visible._tag === 'Navigation' && visible.navigation === navigation) {
        return true;
      }
      retireNavigation(lifecycle, navigation);
      return false;
    });

    switch (render._tag) {
      case 'Initial':
        break;
      case 'Navigation':
        if (getNavigationPhase(lifecycle, render.navigation) === 'Scheduled') {
          lifecycle.phases.set(render.navigation, 'Visible');
        }
        render.navigation.committed.resolve();
        break;
      case 'Refresh':
        lifecycle.stableRouteTree = render.routeTree;
        render.committed.resolve();
        break;
      case 'Rollback':
        retireNavigation(lifecycle, render.navigation);
        break;
    }
  };

  return { commit, controller };
};
