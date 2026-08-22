'use client';

import { createContext, use, type ReactNode } from 'react';

export type RouteNode = {
  readonly id: string;
  readonly element: ReactNode;
  readonly slots: Readonly<Record<string, RouteNode | null>>;
};

type RouteNodeRendererProps = {
  readonly node: RouteNode;
};

type RouteTreeProps = {
  readonly root: RouteNode;
};

type RouteOutletProps = {
  readonly name: string;
};

const RouteNodeContext = createContext<RouteNode | null>(null);

const RouteNodeRenderer = ({ node }: RouteNodeRendererProps) => (
  <RouteNodeContext value={node}>{node.element}</RouteNodeContext>
);

export const RouteTree = ({ root }: RouteTreeProps) => <RouteNodeRenderer node={root} />;

export const RouteOutlet = ({ name }: RouteOutletProps) => {
  const node = use(RouteNodeContext);
  if (node === null) {
    throw new Error(`Route slot "${name}" rendered outside its route node.`);
  }

  const child = node.slots[name];
  if (child === undefined) {
    throw new Error(`Route node "${node.id}" does not declare slot "${name}".`);
  }

  return child === null ? null : <RouteNodeRenderer node={child} />;
};
