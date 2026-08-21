import type { ReactNode } from 'react';

declare const LoadingTypeId: unique symbol;

export type LoadingComponent = {
  (): Awaited<ReactNode>;
  readonly [LoadingTypeId]: typeof LoadingTypeId;
};

const make = (render: () => Awaited<ReactNode>): LoadingComponent => render as LoadingComponent;

export const Loading = { make } as const;
