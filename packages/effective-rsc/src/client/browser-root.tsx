import { Deferred, Effect, Schema } from 'effect';
import { createElement, startTransition, useLayoutEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';

import type { FlightPayload } from '../rsc/flight';
import type { NavigationRevision } from './navigation-state';

export class BrowserRootHydrationError extends Schema.TaggedError<BrowserRootHydrationError>()(
  'BrowserRootHydrationError',
  { cause: Schema.Defect() },
) {}

export class BrowserRootUnavailableError extends Schema.TaggedError<BrowserRootUnavailableError>()(
  'BrowserRootUnavailableError',
  { lifecycle: Schema.Literals(['Hydrating', 'Unmounted']) },
) {}

export class BrowserRootRenderError extends Schema.TaggedError<BrowserRootRenderError>()(
  'BrowserRootRenderError',
  { cause: Schema.Defect() },
) {}

export type BrowserUpdate =
  | {
      readonly _tag: 'Navigation';
      readonly payload: FlightPayload;
      readonly revision: NavigationRevision;
    }
  | {
      readonly _tag: 'ServerFunction';
      readonly payload: FlightPayload;
    };

type BrowserRender =
  | {
      readonly _tag: 'Initial';
      readonly payload: FlightPayload;
    }
  | (BrowserUpdate & { readonly committed: Deferred.Deferred<void> });

type BrowserRootProps = {
  readonly render: BrowserRender;
};

export const hydrateBrowserRoot = Effect.fnUntraced(function* (
  container: Element | Document,
  initialPayload: FlightPayload,
) {
  let lifecycle: 'Hydrating' | 'Mounted' | 'Unmounted' = 'Hydrating';

  function BrowserRoot({ render }: BrowserRootProps) {
    useLayoutEffect(() => {
      lifecycle = 'Mounted';

      return () => {
        lifecycle = 'Unmounted';
      };
    }, []);

    useLayoutEffect(() => {
      switch (render._tag) {
        case 'Initial':
          break;
        case 'Navigation':
        case 'ServerFunction':
          void Deferred.doneUnsafe(render.committed, Effect.void);
      }
    }, [render]);

    return render.payload.root;
  }

  const root = yield* Effect.try({
    try: () =>
      hydrateRoot(
        container,
        createElement(BrowserRoot, {
          render: { _tag: 'Initial', payload: initialPayload },
        }),
        { formState: initialPayload.formState },
      ),
    catch: (cause) => new BrowserRootHydrationError({ cause }),
  });

  const schedule = Effect.fnUntraced(function* (update: BrowserUpdate) {
    if (lifecycle !== 'Mounted') {
      return yield* new BrowserRootUnavailableError({
        lifecycle,
      });
    }

    const committed = yield* Deferred.make<void>();
    const render = { ...update, committed };
    yield* Effect.try({
      try: () =>
        startTransition(() => {
          root.render(createElement(BrowserRoot, { render }));
        }),
      catch: (cause) => new BrowserRootRenderError({ cause }),
    });

    return {
      committed: Deferred.await(committed),
    };
  });

  return { schedule };
});
