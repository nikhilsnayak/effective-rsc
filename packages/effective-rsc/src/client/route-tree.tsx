'use client';

import { createContext, use } from 'react';

import type { RouteTreeModel } from '../rsc/route-tree';

type RouteNodeRendererProps = { readonly node: RouteTreeModel };
type RouteTreeProps = { readonly root: RouteTreeModel };

const RouteNodeContext = createContext<RouteTreeModel | null>(null);

function RouteNodeRenderer({ node }: RouteNodeRendererProps) {
  return <RouteNodeContext value={node}>{node.content}</RouteNodeContext>;
}

export function RouteTree({ root }: RouteTreeProps) {
  return <RouteNodeRenderer node={root} />;
}

export function RouteOutlet() {
  const node = use(RouteNodeContext);
  if (node === null) {
    throw new TypeError('RouteOutlet rendered outside its route node.');
  }
  return node.child === null ? null : <RouteNodeRenderer key={node.child.id} node={node.child} />;
}
