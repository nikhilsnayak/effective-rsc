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
import { BrowserRenderStatus } from './browser-render-status';
import { type BrowserRender, BrowserRenderer } from './browser-renderer';
import { BrowserFailureScreen } from './browser-screen';
import { RouteTree } from './route-tree';

export class ReactDOMHydrationError extends Schema.TaggedError<ReactDOMHydrationError>()(
  'ReactDOMHydrationError',
  { cause: Schema.Defect() },
) {}

type BrowserErrorBoundaryState =
  | { readonly _tag: 'Uninitialized' }
  | { readonly _tag: 'Ready'; readonly render: BrowserRender }
  | { readonly _tag: 'Failed'; readonly render: BrowserRender };
type BrowserErrorBoundaryProps = {
  readonly children: ReactNode;
  readonly onError: (error: unknown, info: ErrorInfo) => void;
  readonly onRendered: () => void;
  readonly render: BrowserRender;
};

class BrowserErrorBoundary extends Component<BrowserErrorBoundaryProps, BrowserErrorBoundaryState> {
  override readonly state: BrowserErrorBoundaryState = { _tag: 'Uninitialized' };

  static getDerivedStateFromError() {
    return { _tag: 'Failed' } as const;
  }

  static getDerivedStateFromProps(
    props: BrowserErrorBoundaryProps,
    state: BrowserErrorBoundaryState,
  ): BrowserErrorBoundaryState | null {
    if (state._tag !== 'Uninitialized' && props.render === state.render) {
      return null;
    }
    // Discard acknowledges a cancelled candidate, not a request to retry the failed tree.
    return state._tag === 'Failed' && props.render._tag === 'Discard'
      ? { _tag: 'Failed', render: props.render }
      : { _tag: 'Ready', render: props.render };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError(error, info);
  }

  override componentDidMount() {
    if (this.state._tag === 'Ready') {
      this.props.onRendered();
    }
  }

  override componentDidUpdate() {
    if (this.state._tag === 'Ready') {
      this.props.onRendered();
    }
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
      const renderStatus = yield* BrowserRenderStatus;

      const hydrate = Effect.fnUntraced(function* (
        container: Element | Document,
        initialPayload: FlightPayload,
      ) {
        const browserRendererReady = Promise.withResolvers<void>();
        const reportError = (error: unknown, info: ErrorInfo) => {
          void run(
            Effect.gen(function* () {
              yield* renderStatus.report({
                _tag: 'Failed',
                error,
                componentStack: info.componentStack ?? null,
              });
              yield* Effect.logError('Uncaught client render error.', error, info.componentStack);
            }),
          );
        };

        const reportRendered = () => {
          void run(renderStatus.report({ _tag: 'Rendered' }));
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
            <BrowserErrorBoundary onError={reportError} onRendered={reportRendered} render={render}>
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
