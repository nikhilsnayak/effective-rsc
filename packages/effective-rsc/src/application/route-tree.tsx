'use client';

import { createContext, use } from 'react';
import type { ReactNode } from 'react';

export type RouteTreeModel = {
  readonly child: RouteTreeModel | null;
  readonly content: ReactNode;
  readonly id: string;
};

const destinationId = (root: RouteTreeModel): string => {
  let node = root;
  while (node.child !== null) {
    node = node.child;
  }
  return node.id;
};

/**
 * Retains revealed content only for the same authored Layout scope while publishing a different
 * Page. Role-qualified scope identities make the first different concern terminate reuse and let
 * the destination Loading boundary mount normally.
 */
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
