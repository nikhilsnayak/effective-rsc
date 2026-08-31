import { AsyncLocalStorage } from 'node:async_hooks';

import type { Effect } from 'effect';

export type RenderRuntime<Services> = <Output, Error>(
  effect: Effect.Effect<Output, Error, Services>,
) => Promise<Output>;

type RenderConcern = 'Component' | 'Layout' | 'Page';

type BoundRenderRuntime = {
  readonly activeMiddleware: ReadonlyArray<object>;
  readonly run: RenderRuntime<any>;
};

export type RenderRuntimeContext = {
  readonly bind: <Services, Output>(
    runtime: RenderRuntime<Services>,
    activeMiddleware: ReadonlyArray<object>,
    evaluate: () => Output,
  ) => Output;
  readonly run: <Output, Error, Services>(
    concern: RenderConcern,
    effect: Effect.Effect<Output, Error, Services>,
    requiredMiddleware: ReadonlyArray<object>,
  ) => Promise<Output>;
};

export const makeRenderRuntimeContext = (): RenderRuntimeContext => {
  const storage = new AsyncLocalStorage<BoundRenderRuntime>();

  return {
    bind: (runtime, activeMiddleware, evaluate) =>
      storage.run({ activeMiddleware, run: runtime }, evaluate),
    run: (concern, effect, requiredMiddleware) => {
      const bound = storage.getStore();
      if (bound === undefined) {
        throw new TypeError(`ERSC ${concern} rendered outside its application request runtime.`);
      }
      const middlewareAvailable = requiredMiddleware.every((required) =>
        bound.activeMiddleware.includes(required),
      );
      if (!middlewareAvailable) {
        throw new TypeError(
          `ERSC ${concern} requires a middleware scope that is not active for this request.`,
        );
      }

      return bound.run(effect);
    },
  };
};
