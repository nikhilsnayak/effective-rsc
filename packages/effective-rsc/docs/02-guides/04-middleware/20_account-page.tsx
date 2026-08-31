/**
 * @title Consuming middleware data in a Page
 */
import { Effect } from 'effect';

import { AuthenticatedERSC, CurrentUser } from './10_auth';

export const AccountPage = AuthenticatedERSC.Page.make({
  render: Effect.fn('AccountPage.render')(function* () {
    const user = yield* CurrentUser;
    return <h1>Welcome, {user.name}</h1>;
  }),
});
