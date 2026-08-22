import type { Effect } from 'effect';
import type { ReactNode } from 'react';

import type { RenderRuntime } from './render-runtime';

declare const LayoutTypeId: unique symbol;
declare const LayoutServicesTypeId: unique symbol;

export type LayoutConcern<SlotName extends string = never> = {
  readonly [LayoutTypeId]: SlotName;
};

export type LayoutProps<SlotName extends string = never> = {
  readonly children: ReactNode;
} & {
  readonly [Name in SlotName]: ReactNode;
};

type LayoutComponentProps<Services, SlotName extends string> = LayoutProps<SlotName> & {
  readonly runtime: RenderRuntime<Services>;
};

export type LayoutComponent<Services, SlotName extends string = never> = LayoutConcern<SlotName> & {
  readonly [LayoutServicesTypeId]: Services;
  (props: LayoutComponentProps<Services, SlotName>): ReactNode;
  readonly slots: ReadonlyArray<SlotName>;
};

type LayoutOptions<SlotNames extends ReadonlyArray<string>, Output, Error, Services> = {
  readonly slots: SlotNames;
  readonly render: (
    props: LayoutProps<SlotNames[number]>,
  ) => Effect.Effect<Output, Error, Services>;
};

const make = <
  const SlotNames extends ReadonlyArray<string>,
  Output extends ReactNode,
  Error,
  Services,
>({
  slots,
  render,
}: LayoutOptions<SlotNames, Output, Error, Services>): LayoutComponent<
  Services,
  SlotNames[number]
> => {
  const declaredSlots = new Set<string>();
  for (const slot of slots) {
    if (slot === 'children') {
      throw new TypeError(
        'Layout slot "children" is implicit and must not be declared as a parallel slot.',
      );
    }
    if (declaredSlots.has(slot)) {
      throw new TypeError(`Layout slot "${slot}" is declared more than once.`);
    }
    declaredSlots.add(slot);
  }

  const LayoutComponent = ({
    runtime,
    ...props
  }: LayoutComponentProps<Services, SlotNames[number]>) =>
    runtime(render(props as LayoutProps<SlotNames[number]>));

  Object.defineProperty(LayoutComponent, 'slots', {
    value: Object.freeze([...slots]),
  });

  return LayoutComponent as unknown as LayoutComponent<Services, SlotNames[number]>;
};

export const Layout = { make } as const;
