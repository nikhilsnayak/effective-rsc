/**
 * @title A minimal application
 *
 * Create values from one ERSC identity and close it with ERSC.make.
 */
import { Effect } from 'effect';
import { Application } from 'effective-rsc';

const ERSC = Application.ersc();

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});

const HomePage = ERSC.Page.make({
  render: () => Effect.succeed(<h1>Hello from effective-rsc</h1>),
});

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/', HomePage),
});
