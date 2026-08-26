import { Suspense } from 'react';

import type { PagePathParams } from '../application/page';
import type { CompiledDestination } from '../application/route-graph';
import type { AbsolutePath } from '../application/route-path';
import { RouteOutlet } from '../client/route-tree';
import type { RouteTreeModel } from './route-tree';

type RenderRouteTreeOptions<Services> = {
  readonly destination: CompiledDestination<Services>;
  readonly pathname: AbsolutePath;
  readonly pathParams: PagePathParams;
};

export const renderRouteTree = <Services,>({
  destination,
  pathname,
  pathParams,
}: RenderRouteTreeOptions<Services>): RouteTreeModel => {
  const Page = destination.page.component;
  let tree: RouteTreeModel = {
    child: null,
    content: <Page params={pathParams} />,
    id: `page:${pathname}`,
  };

  for (let index = destination.scopes.length - 1; index >= 0; index--) {
    const scope = destination.scopes[index];
    if (scope === undefined) {
      continue;
    }

    if (scope.loading !== null) {
      const Loading = scope.loading;
      tree = {
        child: tree,
        content: (
          <Suspense fallback={<Loading />}>
            <RouteOutlet />
          </Suspense>
        ),
        id: `loading:${scope.id}:${pathname}`,
      };
    }

    if (scope.layout !== null) {
      const Layout = scope.layout;
      tree = {
        child: tree,
        content: (
          <Layout>
            <RouteOutlet />
          </Layout>
        ),
        id: `layout:${scope.id}`,
      };
    }
  }

  return tree;
};
