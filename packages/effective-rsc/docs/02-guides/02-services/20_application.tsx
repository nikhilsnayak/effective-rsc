/**
 * @title Providing services at the composition boundary
 *
 * Declare the service union on ERSC and provide its Layer once at ERSC.make.
 */
import { Effect } from 'effect';
import { Application } from 'effective-rsc';

import { Catalog } from './10_catalog';

const ERSC = Application.ersc<Catalog>();

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});

const FeaturedPage = ERSC.Page.make({
  render: Effect.fn('FeaturedPage.render')(function* () {
    const catalog = yield* Catalog;
    const items = yield* catalog.featured;
    return (
      <main>
        <h1>Featured products</h1>
        <ul>
          {items.map((item) => (
            <li key={item.name}>
              {item.name}: ${item.price}
            </li>
          ))}
        </ul>
      </main>
    );
  }),
});

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/', FeaturedPage),
  servicesLayer: Catalog.layer,
});
