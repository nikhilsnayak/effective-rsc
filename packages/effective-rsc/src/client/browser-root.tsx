import { Effect, Schema } from 'effect';
import { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { hydrateRoot } from 'react-dom/client';

import type { FlightPayload } from '../rsc/flight';
import {
  type BrowserRender,
  type BrowserRootController,
  makeBrowserRenderer,
} from './browser-renderer';
import { RouteTree } from './route-tree';

export class BrowserRootHydrationError extends Schema.TaggedError<BrowserRootHydrationError>()(
  'BrowserRootHydrationError',
  { cause: Schema.Defect() },
) {}

export const hydrateBrowserRoot = Effect.fnUntraced(function* (
  container: Element | Document,
  initialPayload: FlightPayload,
) {
  const browserRootReady = Promise.withResolvers<BrowserRootController>();

  function BrowserRoot() {
    const [render, setRender] = useState<BrowserRender>(() => ({
      _tag: 'Initial',
      routeTree: initialPayload.routeTree,
    }));
    const rendererRef = useRef<ReturnType<typeof makeBrowserRenderer> | null>(null);
    if (rendererRef.current === null) {
      // oxlint-disable-next-line react/refs -- guarded lazy initialization is stable after the first render
      rendererRef.current = makeBrowserRenderer(initialPayload.routeTree, setRender);
    }

    useLayoutEffect(() => {
      browserRootReady.resolve(rendererRef.current!.controller);
    }, []);

    useLayoutEffect(() => {
      rendererRef.current!.commit(render);
    }, [render]);

    return <RouteTree root={render.routeTree} />;
  }

  yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        hydrateRoot(
          container,
          <StrictMode>
            <BrowserRoot />
          </StrictMode>,
          { formState: initialPayload.formState },
        ),
      catch: (cause) => new BrowserRootHydrationError({ cause }),
    }),
    (root) => Effect.sync(() => root.unmount()),
  );
  const browserRoot = yield* Effect.promise(() => browserRootReady.promise);

  return browserRoot;
});
