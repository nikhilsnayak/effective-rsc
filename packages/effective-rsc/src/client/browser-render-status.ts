import { Context, Effect, Layer, SubscriptionRef } from 'effect';

type RenderStatus =
  | { readonly _tag: 'Waiting' }
  | { readonly _tag: 'Rendered' }
  | { readonly _tag: 'Failed'; readonly error: unknown; readonly componentStack: string | null };

// Replay the latest status: diagnostics may start after hydration has already failed.
export class BrowserRenderStatus extends Context.Service<BrowserRenderStatus>()(
  'ersc/client/BrowserRenderStatus',
  {
    make: SubscriptionRef.make<RenderStatus>({ _tag: 'Waiting' }).pipe(
      Effect.map((status) => ({
        changes: SubscriptionRef.changes(status),
        get: SubscriptionRef.get(status),
        report: (value: RenderStatus) => SubscriptionRef.set(status, value),
      })),
    ),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
