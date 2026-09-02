import { Context, Effect, Layer, MutableRef } from 'effect';

import type { RouteTreeModel } from '../rsc/route-tree';
import { FlightClient, type FlightLoadError } from './flight-client';
import { NavigationApi } from './navigation-api';

type CachedRoute = {
  readonly entry: CacheHistoryEntry;
  readonly onDispose: () => void;
  readonly routeTree: RouteTreeModel;
};

type CacheHistoryEntry = Pick<
  NavigationHistoryEntry,
  'addEventListener' | 'id' | 'index' | 'removeEventListener'
>;

type RouteCache = Map<string, CachedRoute>;

export type RouteLoad =
  | {
      readonly _tag: 'Route';
      readonly completed: Effect.Effect<void, FlightLoadError>;
      readonly cacheCurrent: () => void;
      readonly release: Effect.Effect<void>;
      readonly resolvedUrl: URL;
      readonly routeTree: RouteTreeModel;
    }
  | {
      readonly _tag: 'Document';
      readonly release: Effect.Effect<void>;
    };

export type RouteLoadRequest = {
  readonly destination: Pick<NavigationDestination, 'id' | 'url'>;
  readonly navigationType: NavigationType;
};

export class RouteLoader extends Context.Service<RouteLoader>()('ersc/client/RouteLoader', {
  make: Effect.gen(function* () {
    const flightClient = yield* FlightClient;
    const navigationApi = yield* NavigationApi;
    const scope = yield* Effect.scope;
    const cacheRef = MutableRef.make<RouteCache>(new Map());

    const remove = (cache: RouteCache, entry: CacheHistoryEntry) => {
      const cached = cache.get(entry.id);
      if (cached?.entry === entry) {
        cache.delete(entry.id);
      }
    };

    const store = (cache: RouteCache, entry: CacheHistoryEntry, routeTree: RouteTreeModel) => {
      const cached = cache.get(entry.id);
      if (cached?.entry !== entry) {
        cached?.entry.removeEventListener('dispose', cached.onDispose);
        const onDispose = () => remove(cache, entry);
        entry.addEventListener('dispose', onDispose, { once: true });
        cache.set(entry.id, { entry, onDispose, routeTree });
        return;
      }
      cache.set(entry.id, { ...cached, routeTree });
    };

    const clear = (cache: RouteCache) => {
      for (const cached of cache.values()) {
        cached.entry.removeEventListener('dispose', cached.onDispose);
      }
      cache.clear();
    };

    const invalidate = () => {
      clear(MutableRef.get(cacheRef));
      MutableRef.set(cacheRef, new Map());
    };

    const cacheCurrent = (cache: RouteCache, routeTree: RouteTreeModel) => () => {
      if (MutableRef.get(cacheRef) !== cache) {
        return;
      }
      const entry = navigationApi.getCurrentEntry();
      if (entry !== null) {
        store(cache, entry, routeTree);
      }
    };

    const prepareRefresh = (routeTree: RouteTreeModel) => {
      invalidate();
      const cache = MutableRef.get(cacheRef);
      const entry = navigationApi.getCurrentEntry();
      return () => {
        if (MutableRef.get(cacheRef) === cache && entry !== null && entry.index !== -1) {
          store(cache, entry, routeTree);
        }
      };
    };

    const load = Effect.fnUntraced(function* (request: RouteLoadRequest) {
      const cache = MutableRef.get(cacheRef);
      if (request.navigationType === 'traverse') {
        const cached = cache.get(request.destination.id);
        if (cached !== undefined) {
          return {
            _tag: 'Route',
            cacheCurrent: () => undefined,
            completed: Effect.void,
            release: Effect.void,
            resolvedUrl: new URL(request.destination.url),
            routeTree: cached.routeTree,
          } satisfies RouteLoad;
        }
      }

      const resource = yield* flightClient.load({
        _tag: 'Navigation',
        destination: new URL(request.destination.url),
      });
      if (resource._tag === 'Document') {
        return resource satisfies RouteLoad;
      }
      return {
        _tag: 'Route',
        cacheCurrent: cacheCurrent(cache, resource.payload.routeTree),
        completed: resource.completed,
        release: resource.release,
        resolvedUrl: resource.resolvedUrl,
        routeTree: resource.payload.routeTree,
      } satisfies RouteLoad;
    });

    const loadInitial = Effect.gen(function* () {
      const cache = MutableRef.get(cacheRef);
      const entry = navigationApi.getCurrentEntry();
      const resource = yield* flightClient.loadInitial;

      if (entry !== null) {
        yield* resource.completed.pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (MutableRef.get(cacheRef) === cache && entry.index !== -1) {
                store(cache, entry, resource.payload.routeTree);
              }
            }),
          ),
          Effect.forkIn(scope),
        );
      }

      return resource.payload;
    });

    yield* Effect.addFinalizer(() => Effect.sync(() => clear(MutableRef.get(cacheRef))));

    return { invalidate, load, loadInitial, prepareRefresh };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerTest = Layer.mock(this);
}
