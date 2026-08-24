'use client';

import { createContext, use } from 'react';
import type { ReactNode } from 'react';

export type RouteTreeModel = {
  readonly child: RouteTreeModel | null;
  readonly content: ReactNode;
  readonly id: string;
};

const destinationId = (node: RouteTreeModel): string =>
  node.child === null ? node.id : destinationId(node.child);

/**
 * Retains the revealed content for the common Layout prefix while publishing a different Page.
 * Loading and Page nodes use the destination pathname as their identity, so the first changed id
 * terminates reuse and lets the destination Loading boundary mount normally.
 */
export const retainSharedLayoutContent = (
  current: RouteTreeModel,
  destination: RouteTreeModel,
): RouteTreeModel => {
  if (destinationId(current) === destinationId(destination) || current.id !== destination.id) {
    return destination;
  }

  return {
    child:
      current.child === null || destination.child === null
        ? destination.child
        : retainSharedLayoutContent(current.child, destination.child),
    content: current.content,
    id: destination.id,
  };
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
