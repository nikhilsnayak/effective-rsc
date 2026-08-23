'use client';

import { createContext, Suspense, use, type ReactNode } from 'react';

import type { RouteTree as RouteTreeModel } from '../rsc/route-tree';

export type RouteRenderData = {
  readonly content: ReactNode;
  readonly loading: ReactNode | null;
};

type RenderableRouteTree = RouteTreeModel<RouteRenderData>;

type RouteNodeRendererProps = {
  readonly node: RenderableRouteTree;
};

type RouteTreeProps = {
  readonly root: RenderableRouteTree;
};

type RouteOutletProps = {
  readonly name: string;
};

const RouteNodeContext = createContext<RenderableRouteTree | null>(null);

const RouteNodeRenderer = ({ node }: RouteNodeRendererProps) => {
  const content = node.hasLoadingBoundary ? (
    <Suspense key={node.key} fallback={node.data.loading}>
      {node.data.content}
    </Suspense>
  ) : (
    node.data.content
  );

  return <RouteNodeContext value={node}>{content}</RouteNodeContext>;
};

export const RouteTree = ({ root }: RouteTreeProps) => <RouteNodeRenderer node={root} />;

export const RouteOutlet = ({ name }: RouteOutletProps) => {
  const node = use(RouteNodeContext);
  if (node === null) {
    throw new Error(`Route slot "${name}" rendered outside its route node.`);
  }

  const child = node.slots[name];
  if (child === undefined) {
    throw new Error(`Route node "${node.key}" does not declare slot "${name}".`);
  }

  return child === null ? null : <RouteNodeRenderer node={child} />;
};
