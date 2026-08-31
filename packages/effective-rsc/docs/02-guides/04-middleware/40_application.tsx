/**
 * @title Activating middleware with Routes
 */
import { Effect } from 'effect';

import { ERSC, AuthenticatedERSC } from './10_auth';
import { AccountPage } from './20_account-page';

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});

const routes = AuthenticatedERSC.Routes.make({ layout: RootLayout }).page('/account', AccountPage);

export default ERSC.make({ routes });
