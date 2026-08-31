/**
 * @title Composing ERSC and userland HTTP
 *
 * ERSC concerns and native HTTP routes share one application Layer.
 */
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import { Application } from 'effective-rsc';

import { Catalog } from '../02-services/10_catalog';

const CatalogApi = HttpRouter.use(
  Effect.fnUntraced(function* (router) {
    const catalog = yield* Catalog;
    const response = Effect.map(catalog.featured, HttpServerResponse.jsonUnsafe);
    yield* router.add('GET', '/api/catalog', response);
  }),
);

const GlobalHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.map(httpEffect, HttpServerResponse.setHeader('x-content-type-options', 'nosniff')),
  { global: true },
);

const ApplicationLayer = Layer.mergeAll(CatalogApi, GlobalHeaders).pipe(
  Layer.provideMerge(Catalog.layer),
);

const ERSC = Application.ersc<Catalog>();

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});

const CatalogPage = ERSC.Page.make({
  render: Effect.fn('CatalogPage.render')(function* () {
    const catalog = yield* Catalog;
    const items = yield* catalog.featured;
    return (
      <ul>
        {items.map((item) => (
          <li key={item.name}>
            {item.name}: ${item.price}
          </li>
        ))}
      </ul>
    );
  }),
});

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/catalog', CatalogPage),
  layer: ApplicationLayer,
});
