import type { Effect } from 'effect';
import type { ReactNode } from 'react';

import type { RenderRuntime } from './render-runtime';

declare const LayoutTypeId: unique symbol;
declare const LayoutServicesTypeId: unique symbol;

export type LayoutConcern = {
  readonly [LayoutTypeId]: typeof LayoutTypeId;
};

export type LayoutProps = {
  readonly children: ReactNode;
};

type LayoutComponentProps<Services> = LayoutProps & {
  readonly runtime: RenderRuntime<Services>;
};

export type LayoutComponent<Services> = LayoutConcern & {
  readonly [LayoutServicesTypeId]: Services;
  (props: LayoutComponentProps<Services>): ReactNode;
};

type LayoutOptions<Output extends Awaited<ReactNode>, Error, Services> = {
  readonly render: (props: LayoutProps) => Effect.Effect<Output, Error, Services>;
};

const make = <Output extends Awaited<ReactNode>, Error, Services>({
  render,
}: LayoutOptions<Output, Error, Services>): LayoutComponent<Services> => {
  const LayoutComponent = ({ runtime, ...props }: LayoutComponentProps<Services>) =>
    runtime(render(props));

  return LayoutComponent as unknown as LayoutComponent<Services>;
};

export const Layout = { make } as const;
