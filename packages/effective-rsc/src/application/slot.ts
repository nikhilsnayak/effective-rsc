import type { Effect } from 'effect';
import type { ReactNode } from 'react';

import type { RenderRuntime } from './render-runtime';

declare const SlotTypeId: unique symbol;

export type SlotConcern = {
  readonly [SlotTypeId]: typeof SlotTypeId;
};

type SlotProps<Services> = {
  readonly runtime: RenderRuntime<Services>;
};

export type SlotComponent<Services> = SlotConcern & {
  (props: SlotProps<Services>): Promise<Awaited<ReactNode>>;
};

const make = <Output extends Awaited<ReactNode>, Error, Services>(
  operation: () => Effect.Effect<Output, Error, Services>,
) => {
  const SlotComponent = ({ runtime }: SlotProps<Services>) => runtime(operation());

  return SlotComponent as unknown as SlotComponent<Services>;
};

export const Slot = { make } as const;
