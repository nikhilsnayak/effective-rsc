'use client';

import { createContext, use } from 'react';
import type { ReactNode } from 'react';

export type RouteTreeModel = {
  readonly child: RouteTreeModel | null;
  readonly content: ReactNode;
  readonly id: string;
};

type RouteNodeRendererProps = {
  readonly node: RouteTreeModel;
};

type RouteTreeProps = {
  readonly root: RouteTreeModel;
};

const RouteNodeContext = createContext<RouteTreeModel | null>(null);

const RouteNodeRenderer = ({ node }: RouteNodeRendererProps) => (
  <RouteNodeContext value={node}>{node.content}</RouteNodeContext>
);

export const RouteTree = ({ root }: RouteTreeProps) => <RouteNodeRenderer node={root} />;

export const RouteOutlet = () => {
  const node = use(RouteNodeContext);
  if (node === null) {
    throw new Error('RouteOutlet rendered outside its route node.');
  }

  return node.child === null ? null : <RouteNodeRenderer key={node.child.id} node={node.child} />;
};
