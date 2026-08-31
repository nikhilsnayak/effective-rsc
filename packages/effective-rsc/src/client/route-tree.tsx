'use client';

import { createContext, use } from 'react';

import type { RouteTreeModel } from '../rsc/route-tree';

const destinationId = (root: RouteTreeModel): string => {
  let node = root;
  while (node.child !== null) {
    node = node.child;
  }
  return node.id;
};

/** Retains revealed content for the shared authored Layout prefix during navigation. */
export const retainSharedLayoutContent = (
  current: RouteTreeModel,
  destination: RouteTreeModel,
): RouteTreeModel => {
  if (destinationId(current) === destinationId(destination)) {
    return destination;
  }

  const retainSharedLayouts = (
    currentNode: RouteTreeModel,
    destinationNode: RouteTreeModel,
  ): RouteTreeModel => {
    if (currentNode.id !== destinationNode.id) {
      return destinationNode;
    }
    return {
      child:
        currentNode.child === null || destinationNode.child === null
          ? destinationNode.child
          : retainSharedLayouts(currentNode.child, destinationNode.child),
      content: currentNode.content,
      id: destinationNode.id,
    };
  };

  return retainSharedLayouts(current, destination);
};

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
    throw new Error('RouteOutlet rendered outside its route node.');
  }
  return node.child === null ? null : <RouteNodeRenderer key={node.child.id} node={node.child} />;
}
