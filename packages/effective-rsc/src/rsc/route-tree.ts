import type { ReactNode } from 'react';

export type RouteTreeModel = {
  readonly child: RouteTreeModel | null;
  readonly content: ReactNode;
  readonly id: string;
};
