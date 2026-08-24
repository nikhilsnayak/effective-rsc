import { Effect, Schema } from 'effect';
import { useLayoutEffect, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { RouteTree, type RouteTreeModel } from '../application/route-tree';
import type { FlightPayload } from '../rsc/flight';

export class BrowserRootHydrationError extends Schema.TaggedError<BrowserRootHydrationError>()(
  'BrowserRootHydrationError',
  { cause: Schema.Defect() },
) {}

export type BrowserRenderRequest = {
  readonly _tag: 'Update';
  readonly onCommit: () => void;
  readonly routeTree: RouteTreeModel;
};

type BrowserRender =
  | {
      readonly _tag: 'Initial';
      readonly routeTree: RouteTreeModel;
    }
  | BrowserRenderRequest;

export type BrowserRootController = {
  readonly render: (request: BrowserRenderRequest) => void;
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
        render: setRender,
      });
    }, []);

    useLayoutEffect(() => {
      if (render._tag !== 'Initial') {
        render.onCommit();
      }
    }, [render]);

    return <RouteTree root={render.routeTree} />;
  }

  yield* Effect.try({
    try: () => hydrateRoot(container, <BrowserRoot />, { formState: initialPayload.formState }),
    catch: (cause) => new BrowserRootHydrationError({ cause }),
  });
  const browserRoot = yield* Effect.promise(() => browserRootReady.promise);

  return browserRoot;
});
