import { Context, Effect, Layer, MutableRef } from 'effect';

import type { RouteTreeModel } from '../rsc/route-tree';

export type BrowserRendererNavigation = {
  readonly committed: Promise<void>;
  readonly discard: () => Promise<void>;
  readonly retired: Promise<void>;
};

type BrowserRenderUpdate = {
  readonly committed: PromiseWithResolvers<void>;
  readonly retired: PromiseWithResolvers<void>;
  readonly routeTree: RouteTreeModel;
};

type BrowserRenderPhase = 'Scheduled' | 'DiscardRequested' | 'Visible' | 'Completed' | 'Retired';

type BrowserRenderOwner =
  | { readonly _tag: 'Stable' }
  | { readonly _tag: 'Update'; readonly update: BrowserRenderUpdate };

type BrowserRendererLifecycle = {
  active: BrowserRenderOwner;
  readonly phases: WeakMap<BrowserRenderUpdate, BrowserRenderPhase>;
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
      readonly _tag: 'Navigation' | 'Refresh';
      readonly update: BrowserRenderUpdate;
      readonly routeTree: RouteTreeModel;
    }
  | {
      readonly _tag: 'Discard';
      readonly update: BrowserRenderUpdate;
      readonly routeTree: RouteTreeModel;
      readonly visible: BrowserRenderOwner;
    };

const getRenderPhase = (lifecycle: BrowserRendererLifecycle, update: BrowserRenderUpdate) => {
  const phase = lifecycle.phases.get(update);
  if (phase === undefined) {
    throw new TypeError('Browser render does not belong to this root.');
  }
  return phase;
};

const retireUpdate = (lifecycle: BrowserRendererLifecycle, update: BrowserRenderUpdate) => {
  if (getRenderPhase(lifecycle, update) !== 'Retired') {
    lifecycle.phases.set(update, 'Retired');
    update.retired.resolve();
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
            phases: new WeakMap<BrowserRenderUpdate, BrowserRenderPhase>(),
            stableRouteTree: initialRouteTree,
            visible: { _tag: 'Stable' },
          },
          publish,
        });
      };

      const schedule = (routeTree: RouteTreeModel, kind: 'Navigation' | 'Refresh') => {
        const { lifecycle, publish } = getReadyState();
        const update: BrowserRenderUpdate = {
          committed: Promise.withResolvers<void>(),
          retired: Promise.withResolvers<void>(),
          routeTree,
        };
        lifecycle.phases.set(update, 'Scheduled');
        lifecycle.active = { _tag: 'Update', update };
        publish({ _tag: kind, update, routeTree });

        return {
          committed: update.committed.promise,
          discard: () => {
            if (getRenderPhase(lifecycle, update) !== 'Scheduled') {
              // Refresh cancellation can arrive just after React commits. Its visible tree
              // must survive until a successor commits, even if the caller has moved on.
              if (kind === 'Refresh') {
                return update.retired.promise;
              }
              throw new TypeError('Only a scheduled browser navigation can be discarded.');
            }
            lifecycle.phases.set(update, 'DiscardRequested');
            if (lifecycle.active._tag === 'Update' && lifecycle.active.update === update) {
              const visible = lifecycle.visible;
              lifecycle.active =
                visible._tag === 'Update' && getRenderPhase(lifecycle, visible.update) === 'Visible'
                  ? visible
                  : { _tag: 'Stable' };
            }
            publish({
              _tag: 'Discard',
              update,
              routeTree:
                lifecycle.visible._tag === 'Update'
                  ? lifecycle.visible.update.routeTree
                  : lifecycle.stableRouteTree,
              visible: lifecycle.visible,
            });
            return update.retired.promise;
          },
          retired: update.retired.promise,
        };
      };

      const navigate = (routeTree: RouteTreeModel) => schedule(routeTree, 'Navigation');
      const refresh = (routeTree: RouteTreeModel) => schedule(routeTree, 'Refresh');

      const commit = (render: BrowserRender) => {
        const { lifecycle } = getReadyState();
        const previousVisible = lifecycle.visible;
        const visible: BrowserRenderOwner =
          render._tag === 'Navigation' || render._tag === 'Refresh'
            ? { _tag: 'Update', update: render.update }
            : render._tag === 'Discard'
              ? render.visible
              : { _tag: 'Stable' };
        lifecycle.visible = visible;

        if (
          previousVisible._tag === 'Update' &&
          (visible._tag !== 'Update' || visible.update !== previousVisible.update)
        ) {
          retireUpdate(lifecycle, previousVisible.update);
        }

        switch (render._tag) {
          case 'Initial':
            break;
          case 'Discard':
            retireUpdate(lifecycle, render.update);
            break;
          case 'Navigation':
          case 'Refresh':
            if (getRenderPhase(lifecycle, render.update) === 'Scheduled') {
              lifecycle.phases.set(render.update, 'Visible');
            }
            if (lifecycle.active._tag === 'Update' && lifecycle.active.update === render.update) {
              lifecycle.active = { _tag: 'Stable' };
              lifecycle.stableRouteTree = render.routeTree;
              lifecycle.phases.set(render.update, 'Completed');
            }
            render.update.committed.resolve();
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
