import type { ReactNode } from 'react';

declare const LoadingTypeId: unique symbol;

export type LoadingConcern = {
  readonly [LoadingTypeId]: typeof LoadingTypeId;
};

export type LoadingComponent = LoadingConcern & {
  (): Awaited<ReactNode>;
};

const make = (render: () => Awaited<ReactNode>): LoadingComponent => render as LoadingComponent;

export const Loading = { make } as const;
