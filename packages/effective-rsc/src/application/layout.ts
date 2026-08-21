import type { Effect } from 'effect';
import type { ReactNode } from 'react';

import type { RenderRuntime } from './render-runtime';

declare const LayoutTypeId: unique symbol;

export type LayoutProps = {
  readonly children: ReactNode;
};

type LayoutComponentProps<Services> = LayoutProps & {
  readonly runtime: RenderRuntime<Services>;
};

export type LayoutComponent<Services> = {
  (props: LayoutComponentProps<Services>): ReactNode;
  readonly [LayoutTypeId]: typeof LayoutTypeId;
};

const make = <Output extends ReactNode, Error, Services>(
  operation: (props: LayoutProps) => Effect.Effect<Output, Error, Services>,
): LayoutComponent<Services> => {
  const LayoutComponent = ({ children, runtime }: LayoutComponentProps<Services>) =>
    runtime(operation({ children }));

  return LayoutComponent as unknown as LayoutComponent<Services>;
};

export const Layout = { make } as const;
