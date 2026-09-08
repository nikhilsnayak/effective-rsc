import { Context, Effect, Layer, MutableRef } from 'effect';

import type { RouteTreeModel } from '../rsc/route-tree';

export type BrowserRendererNavigation = {
  readonly committed: Promise<void>;
  readonly discard: () => Promise<void>;
  readonly retired: Promise<void>;
};

type InitialRender = {
  readonly _tag: 'Initial';
  readonly routeTree: RouteTreeModel;
};

type RouteRender = {
  readonly _tag: 'Navigation' | 'Refresh';
  readonly order: number;
  readonly committed: PromiseWithResolvers<void>;
  readonly retired: PromiseWithResolvers<void>;
  readonly routeTree: RouteTreeModel;
};

export type BrowserRender =
  | InitialRender
  | RouteRender
  | {
      readonly _tag: 'Discard';
      readonly order: number;
      readonly restore: InitialRender | RouteRender;
    };

type LiveRender = {
  readonly _tag: 'Scheduled' | 'DiscardRequested' | 'Committed';
  readonly lastPublicationOrder: number;
};

type BrowserRendererState =
  | { readonly _tag: 'Uninitialized' }
  | {
      readonly _tag: 'Ready';
      current: BrowserRender;
      publicationOrder: number;
      readonly liveRenders: Map<RouteRender, LiveRender>;
      readonly publish: (render: BrowserRender) => void;
    };

export class BrowserRenderer extends Context.Service<BrowserRenderer>()(
  'ersc/client/BrowserRenderer',
  {
    make: Effect.sync(() => {
      const state = MutableRef.make<BrowserRendererState>({ _tag: 'Uninitialized' });
      const publications = new WeakSet<BrowserRender>();
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
          current: { _tag: 'Initial', routeTree: initialRouteTree },
          publicationOrder: 0,
          liveRenders: new Map(),
          publish,
        });
      };

      const publish = (render: BrowserRender) => {
        publications.add(render);
        getReadyState().publish(render);
      };

      const schedule = (routeTree: RouteTreeModel, kind: 'Navigation' | 'Refresh') => {
        const ready = getReadyState();
        const order = ++ready.publicationOrder;
        const render: RouteRender = {
          _tag: kind,
          order,
          committed: Promise.withResolvers<void>(),
          retired: Promise.withResolvers<void>(),
          routeTree,
        };
        ready.liveRenders.set(render, { _tag: 'Scheduled', lastPublicationOrder: order });
        publish(render);

        return {
          committed: render.committed.promise,
          discard: () => {
            const live = ready.liveRenders.get(render);
            // A successor may have already retired this tree before cancellation arrives.
            if (live === undefined) {
              return render.retired.promise;
            }
            if (live._tag !== 'Scheduled') {
              // A committed refresh keeps its stream until React can no longer display it.
              if (kind === 'Navigation') {
                throw new TypeError('Only a scheduled browser navigation can be discarded.');
              }
              return render.retired.promise;
            }
            ready.liveRenders.set(render, {
              _tag: 'DiscardRequested',
              lastPublicationOrder: order,
            });
            const current = ready.current;
            const restore = current._tag === 'Discard' ? current.restore : current;
            const discardOrder = ++ready.publicationOrder;
            if (restore._tag !== 'Initial') {
              // Keep the tree alive even if another render commits before this discard.
              // Reinsertion keeps the map ordered by each render's last publication.
              ready.liveRenders.delete(restore);
              ready.liveRenders.set(restore, {
                _tag: 'Committed',
                lastPublicationOrder: discardOrder,
              });
            }
            publish({ _tag: 'Discard', order: discardOrder, restore });
            return render.retired.promise;
          },
          retired: render.retired.promise,
        };
      };

      const navigate = (routeTree: RouteTreeModel) => schedule(routeTree, 'Navigation');
      const refresh = (routeTree: RouteTreeModel) => schedule(routeTree, 'Refresh');

      const commit = (render: BrowserRender) => {
        const ready = getReadyState();
        if (render._tag === 'Initial') {
          return;
        }
        if (!publications.has(render)) {
          throw new TypeError('Browser render does not belong to this root.');
        }
        const current = ready.current;
        if (current._tag !== 'Initial' && render.order < current.order) {
          throw new TypeError('Browser renders must commit in publication order.');
        }
        const visible = render._tag === 'Discard' ? render.restore : render;
        if (visible._tag !== 'Initial') {
          const live = ready.liveRenders.get(visible);
          if (live === undefined) {
            throw new TypeError('A retired browser tree cannot commit.');
          }
          ready.liveRenders.set(visible, {
            _tag: 'Committed',
            lastPublicationOrder: live.lastPublicationOrder,
          });
        }
        ready.current = render;
        if (render._tag !== 'Discard') {
          render.committed.resolve();
        }

        // A later replacement commit supersedes earlier publications. A tree stays alive
        // while visible or referenced by a newer publication, including a pending discard.
        for (const [retained, live] of ready.liveRenders) {
          if (live.lastPublicationOrder > render.order) {
            break;
          }
          if (retained !== visible) {
            ready.liveRenders.delete(retained);
            retained.retired.resolve();
          }
        }
      };

      return { commit, initialize, navigate, refresh };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
