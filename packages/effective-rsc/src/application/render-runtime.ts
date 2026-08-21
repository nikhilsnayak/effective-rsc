import type { Effect } from 'effect';

export type RenderRuntime<Services> = <Output, Error>(
  effect: Effect.Effect<Output, Error, Services>,
) => Promise<Output>;
