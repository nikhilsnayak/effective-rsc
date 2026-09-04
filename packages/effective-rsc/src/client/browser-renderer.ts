import { Context, Effect, Layer, MutableRef } from 'effect';

import type { RouteTreeModel } from '../rsc/route-tree';

export type BrowserRendererNavigation = {
  readonly committed: Promise<void>;
  readonly discard: () => Promise<void>;
  readonly retired: Promise<void>;
};

type BrowserRenderNavigationState = {
  readonly committed: PromiseWithResolvers<void>;
  readonly retired: PromiseWithResolvers<void>;
  readonly routeTree: RouteTreeModel;
};

type BrowserRenderNavigationPhase =
  | 'Scheduled'
  | 'DiscardRequested'
  | 'Visible'
  | 'Completed'
  | 'Retired';

type BrowserRenderOwner =
  | { readonly _tag: 'Stable' }
  | { readonly _tag: 'Navigation'; readonly navigation: BrowserRenderNavigationState };

type BrowserRendererLifecycle = {
  active: BrowserRenderOwner;
  readonly phases: WeakMap<BrowserRenderNavigationState, BrowserRenderNavigationPhase>;
  stableRouteTree: RouteTreeModel;
  visible: BrowserRenderOwner;
};

type BrowserRendererState =
  | { readonly _tag: 'Uninitialized' }
  | {
      readonly _tag: 'Ready';
      readonly lifecycle: BrowserRendererLifecycle;
      readonly publish: (render: BrowserRender) => void;
    };

export type BrowserRender =
  | { readonly _tag: 'Initial'; readonly routeTree: RouteTreeModel }
  | {
      readonly _tag: 'Navigation';
      readonly navigation: BrowserRenderNavigationState;
      readonly routeTree: RouteTreeModel;
    }
  | {
      readonly _tag: 'Discard';
      readonly navigation: BrowserRenderNavigationState;
      readonly routeTree: RouteTreeModel;
      readonly visible: BrowserRenderOwner;
    }
  | {
      readonly _tag: 'Refresh';
      readonly committed: PromiseWithResolvers<void>;
      readonly routeTree: RouteTreeModel;
    };

const getNavigationPhase = (
  lifecycle: BrowserRendererLifecycle,
  navigation: BrowserRenderNavigationState,
) => {
  const phase = lifecycle.phases.get(navigation);
  if (phase === undefined) {
    throw new TypeError('Browser navigation does not belong to this root.');
  }
  return phase;
};

const retireNavigation = (
  lifecycle: BrowserRendererLifecycle,
  navigation: BrowserRenderNavigationState,
) => {
  if (getNavigationPhase(lifecycle, navigation) !== 'Retired') {
    lifecycle.phases.set(navigation, 'Retired');
    navigation.retired.resolve();
  }
};

export class BrowserRenderer extends Context.Service<BrowserRenderer>()(
  'ersc/client/BrowserRenderer',
  {
    make: Effect.sync(() => {
      const state = MutableRef.make<BrowserRendererState>({ _tag: 'Uninitialized' });
      const getReadyState = () => {
        const current = MutableRef.get(state);
        if (current._tag === 'Uninitialized') {
          throw new TypeError('BrowserRenderer must be initialized by ReactDOMRenderer.');
        }
        return current;
      };

      const initialize = (
        initialRouteTree: RouteTreeModel,
        publish: (render: BrowserRender) => void,
      ) => {
        const current = MutableRef.get(state);
        if (current._tag === 'Ready') {
          if (current.publish === publish) {
            return;
          }
          throw new TypeError('BrowserRenderer cannot be initialized by more than one React root.');
        }

        MutableRef.set(state, {
          _tag: 'Ready',
          lifecycle: {
            active: { _tag: 'Stable' },
            phases: new WeakMap<BrowserRenderNavigationState, BrowserRenderNavigationPhase>(),
            stableRouteTree: initialRouteTree,
            visible: { _tag: 'Stable' },
          },
          publish,
        });
      };

      const navigate = (routeTree: RouteTreeModel) => {
        const { lifecycle, publish } = getReadyState();
        const navigation: BrowserRenderNavigationState = {
          committed: Promise.withResolvers<void>(),
          retired: Promise.withResolvers<void>(),
          routeTree,
        };
        lifecycle.phases.set(navigation, 'Scheduled');
        lifecycle.active = { _tag: 'Navigation', navigation };
        publish({ _tag: 'Navigation', navigation, routeTree: navigation.routeTree });

        return {
          committed: navigation.committed.promise,
          discard: () => {
            if (getNavigationPhase(lifecycle, navigation) !== 'Scheduled') {
              throw new TypeError('Only a scheduled browser navigation can be discarded.');
            }
            lifecycle.phases.set(navigation, 'DiscardRequested');
            if (
              lifecycle.active._tag === 'Navigation' &&
              lifecycle.active.navigation === navigation
            ) {
              const visible = lifecycle.visible;
              lifecycle.active =
                visible._tag === 'Navigation' &&
                getNavigationPhase(lifecycle, visible.navigation) === 'Visible'
                  ? visible
                  : { _tag: 'Stable' };
            }
            publish({
              _tag: 'Discard',
              navigation,
              routeTree:
                lifecycle.visible._tag === 'Navigation'
                  ? lifecycle.visible.navigation.routeTree
                  : lifecycle.stableRouteTree,
              visible: lifecycle.visible,
            });
            return navigation.retired.promise;
          },
          retired: navigation.retired.promise,
        };
      };

      const refresh = (routeTree: RouteTreeModel) => {
        const { lifecycle, publish } = getReadyState();
        const committed = Promise.withResolvers<void>();
        lifecycle.active = { _tag: 'Stable' };
        publish({ _tag: 'Refresh', committed, routeTree });
        return committed.promise;
      };

      const commit = (render: BrowserRender) => {
        const { lifecycle } = getReadyState();
        const previousVisible = lifecycle.visible;
        const visible: BrowserRenderOwner =
          render._tag === 'Navigation'
            ? { _tag: 'Navigation', navigation: render.navigation }
            : render._tag === 'Discard'
              ? render.visible
              : { _tag: 'Stable' };
        lifecycle.visible = visible;

        if (
          previousVisible._tag === 'Navigation' &&
          (visible._tag !== 'Navigation' || visible.navigation !== previousVisible.navigation)
        ) {
          retireNavigation(lifecycle, previousVisible.navigation);
        }

        switch (render._tag) {
          case 'Initial':
            break;
          case 'Discard':
            retireNavigation(lifecycle, render.navigation);
            break;
          case 'Navigation':
            if (getNavigationPhase(lifecycle, render.navigation) === 'Scheduled') {
              lifecycle.phases.set(render.navigation, 'Visible');
            }
            if (
              lifecycle.active._tag === 'Navigation' &&
              lifecycle.active.navigation === render.navigation
            ) {
              lifecycle.active = { _tag: 'Stable' };
              lifecycle.stableRouteTree = render.routeTree;
              lifecycle.phases.set(render.navigation, 'Completed');
            }
            render.navigation.committed.resolve();
            break;
          case 'Refresh':
            lifecycle.stableRouteTree = render.routeTree;
            render.committed.resolve();
            break;
        }
      };

      return { commit, initialize, navigate, refresh };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
