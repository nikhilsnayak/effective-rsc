import { Effect, Schema } from 'effect';
import { StrictMode, useLayoutEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';

import {
  retainSharedLayoutContent,
  RouteTree,
  type RouteTreeModel,
} from '../application/route-tree';
import type { FlightPayload } from '../rsc/flight';

export class BrowserRootHydrationError extends Schema.TaggedError<BrowserRootHydrationError>()(
  'BrowserRootHydrationError',
  { cause: Schema.Defect() },
) {}

export type BrowserRenderRequest = {
  readonly _tag: 'Navigation' | 'ServerFunction';
  readonly routeTree: RouteTreeModel;
};

type PendingBrowserRender = BrowserRenderRequest & {
  readonly onCommit: () => void;
};

type BrowserRender =
  | {
      readonly _tag: 'Initial';
      readonly routeTree: RouteTreeModel;
    }
  | PendingBrowserRender;

export type BrowserRootController = {
  readonly render: (request: BrowserRenderRequest) => Promise<void>;
};

export const hydrateBrowserRoot = Effect.fnUntraced(function* (
  container: Element | Document,
  initialPayload: FlightPayload,
) {
  const browserRootReady = Promise.withResolvers<BrowserRootController>();

  function BrowserRoot() {
    const [render, setRender] = useState<BrowserRender>({
      _tag: 'Initial',
      routeTree: initialPayload.routeTree,
    });

    useLayoutEffect(() => {
      browserRootReady.resolve({
        render: (request) => {
          const committed = Promise.withResolvers<void>();
          setRender((current) => ({
            ...request,
            onCommit: committed.resolve,
            routeTree:
              request._tag === 'Navigation'
                ? retainSharedLayoutContent(current.routeTree, request.routeTree)
                : request.routeTree,
          }));
          return committed.promise;
        },
      });
    }, []);

    useLayoutEffect(() => {
      if (render._tag === 'Navigation' || render._tag === 'ServerFunction') {
        render.onCommit();
      }
    }, [render]);

    return <RouteTree root={render.routeTree} />;
  }

  yield* Effect.try({
    try: () =>
      hydrateRoot(
        container,
        <StrictMode>
          <BrowserRoot />
        </StrictMode>,
        { formState: initialPayload.formState },
      ),
    catch: (cause) => new BrowserRootHydrationError({ cause }),
  });
  const browserRoot = yield* Effect.promise(() => browserRootReady.promise);

  return browserRoot;
});
