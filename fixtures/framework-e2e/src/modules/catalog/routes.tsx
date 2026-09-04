import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';

import { ERSC } from '@/ersc';
import { CatalogPage } from '@/modules/catalog/components/catalog';
import CatalogLayout from '@/modules/catalog/components/catalog-layout';
import CatalogSkeleton from '@/modules/catalog/components/catalog-skeleton';
import { ActorERSC } from '@/modules/fixture/actor';

const CatalogIndexRedirect = ERSC.Middleware.make(() =>
  Effect.succeed(HttpServerResponse.redirect('/catalog/primary')),
);
const CatalogIndexERSC = ActorERSC.withMiddleware(CatalogIndexRedirect);

const CatalogIndexPage = ActorERSC.Page.make({
  render: () =>
    Effect.succeed(
      <main>
        <a href='/catalog/primary'>Open the Primary catalog</a>
      </main>,
    ),
});

const catalogIndexRoutes = CatalogIndexERSC.Routes.make().page('/', CatalogIndexPage);

export const catalogRoutes = ActorERSC.Routes.make({
  layout: CatalogLayout,
  loading: CatalogSkeleton,
})
  .mount('/', catalogIndexRoutes)
  .page('/:group', CatalogPage);
