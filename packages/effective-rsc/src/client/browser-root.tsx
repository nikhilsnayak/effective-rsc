import { Effect, Schema } from 'effect';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  StrictMode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { hydrateRoot } from 'react-dom/client';

import type { FlightPayload } from '../rsc/flight';
import {
  type BrowserRender,
  type BrowserRootController,
  makeBrowserRenderer,
} from './browser-renderer';
import { BrowserFailureScreen } from './browser-screen';
import { ClientRuntime } from './client-runtime';
import { RouteTree } from './route-tree';

export class BrowserRootHydrationError extends Schema.TaggedError<BrowserRootHydrationError>()(
  'BrowserRootHydrationError',
  { cause: Schema.Defect() },
) {}

type BrowserErrorBoundaryState = { readonly _tag: 'Ready' } | { readonly _tag: 'Failed' };
type BrowserErrorBoundaryProps = {
  readonly children: ReactNode;
  readonly onError: (error: unknown, info: ErrorInfo) => void;
};

class BrowserErrorBoundary extends Component<BrowserErrorBoundaryProps, BrowserErrorBoundaryState> {
  override readonly state: BrowserErrorBoundaryState = { _tag: 'Ready' };

  static getDerivedStateFromError(): BrowserErrorBoundaryState {
    return { _tag: 'Failed' };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError(error, info);
  }

  override render() {
    if (this.state._tag === 'Failed') {
      return <BrowserFailureScreen />;
    }

    return this.props.children;
  }
}

export const hydrateBrowserRoot = Effect.fnUntraced(function* (
  container: Element | Document,
  initialPayload: FlightPayload,
) {
  const browserRootReady = Promise.withResolvers<BrowserRootController>();
  const run = yield* ClientRuntime;
  const reportError = (error: unknown, info: ErrorInfo) => {
    void run(Effect.logError('Uncaught client render error.', error, info.componentStack));
  };

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

    return (
      <BrowserErrorBoundary onError={reportError}>
        <RouteTree root={render.routeTree} />
      </BrowserErrorBoundary>
    );
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
