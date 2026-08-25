import { AsyncLocalStorage } from 'node:async_hooks';

import type { Effect } from 'effect';

export type RequestRuntime<Services> = <Output, Error>(
  effect: Effect.Effect<Output, Error, Services>,
) => Promise<Output>;

export type RequestRuntimeContext<Services> = {
  readonly bind: <Output>(runtime: RequestRuntime<Services>, evaluate: () => Output) => Output;
  readonly run: RequestRuntime<Services>;
};

export const makeRequestRuntimeContext = <Services>(): RequestRuntimeContext<Services> => {
  const storage = new AsyncLocalStorage<RequestRuntime<Services>>();

  return {
    bind: (runtime, evaluate) => storage.run(runtime, evaluate),
    run: (effect) => {
      const runtime = storage.getStore();
      if (runtime === undefined) {
        throw new TypeError('An ERSC concern rendered outside its application request runtime.');
      }

      return runtime(effect);
    },
  };
};
