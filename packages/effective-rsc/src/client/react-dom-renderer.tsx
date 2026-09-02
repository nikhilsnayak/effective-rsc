import { Context, Effect, Layer, Schema } from 'effect';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  StrictMode,
  useLayoutEffect,
  useState,
} from 'react';
import { hydrateRoot } from 'react-dom/client';

import type { FlightPayload } from '../rsc/flight';
import { BrowserEffectRunner } from './browser-effect-runner';
import { type BrowserRender, BrowserRenderer } from './browser-renderer';
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

export class ReactDOMRenderer extends Context.Service<ReactDOMRenderer>()(
  'ersc/client/ReactDOMRenderer',
  {
    make: Effect.gen(function* () {
      const browserRenderer = yield* BrowserRenderer;
      const run = yield* BrowserEffectRunner;

      const hydrate = Effect.fnUntraced(function* (
        container: Element | Document,
        initialPayload: FlightPayload,
      ) {
        const browserRendererReady = Promise.withResolvers<void>();
        const reportError = (error: unknown, info: ErrorInfo) => {
          void run(Effect.logError('Uncaught client render error.', error, info.componentStack));
        };

        function Root() {
          const [render, setRender] = useState<BrowserRender>(() => ({
            _tag: 'Initial',
            routeTree: initialPayload.routeTree,
          }));

          useLayoutEffect(() => {
            browserRenderer.initialize(initialPayload.routeTree, setRender);
            browserRendererReady.resolve();
          }, []);

          useLayoutEffect(() => {
            browserRenderer.commit(render);
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
        yield* Effect.promise(() => browserRendererReady.promise);
      });

      return { hydrate };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
