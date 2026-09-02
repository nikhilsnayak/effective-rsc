import { Context, Effect, Layer, Schema, Scope } from 'effect';
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
import { BrowserEffectRunner } from './browser-effect-runner';
import { type BrowserRender, BrowserRenderer, makeBrowserRenderer } from './browser-renderer';
import { BrowserFailureScreen } from './browser-screen';
import { RouteTree } from './route-tree';

export class ReactDOMHydrationError extends Schema.TaggedError<ReactDOMHydrationError>()(
  'ReactDOMHydrationError',
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

export class ReactDOMRenderer extends Context.Service<
  ReactDOMRenderer,
  {
    readonly hydrate: (
      container: Element | Document,
      initialPayload: FlightPayload,
    ) => Effect.Effect<BrowserRenderer, ReactDOMHydrationError, Scope.Scope>;
  }
>()('ersc/client/ReactDOMRenderer') {
  static readonly make = Effect.gen(function* () {
    const run = yield* BrowserEffectRunner;

    const hydrate = Effect.fnUntraced(function* (
      container: Element | Document,
      initialPayload: FlightPayload,
    ) {
      const browserRendererReady = Promise.withResolvers<BrowserRenderer>();
      const reportError = (error: unknown, info: ErrorInfo) => {
        void run(Effect.logError('Uncaught client render error.', error, info.componentStack));
      };

      function Root() {
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
          browserRendererReady.resolve(rendererRef.current!.browserRenderer);
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
                <Root />
              </StrictMode>,
              { formState: initialPayload.formState },
            ),
          catch: (cause) => new ReactDOMHydrationError({ cause }),
        }),
        (root) => Effect.sync(() => root.unmount()),
      );
      return yield* Effect.promise(() => browserRendererReady.promise);
    });

    return ReactDOMRenderer.of({ hydrate });
  });

  static readonly layer = Layer.effect(this, this.make);
}
