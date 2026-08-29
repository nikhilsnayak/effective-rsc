/**
 * @title Closing the Server Function application
 *
 * Close the application with the ERSC value that created the Server Function.
 */
import { Effect } from 'effect';

import { ERSC } from './01_application';
import { followAuthor } from './20_follow-author';
import { FollowAuthorButton } from './30_follow-author-button';

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>{children}</body>
      </html>,
    ),
});

const AuthorPage = ERSC.Page.make({
  render: () => {
    const action = followAuthor.bind(null, { authorId: 'grace-hopper' });

    return Effect.succeed(
      <main>
        <h1>Grace Hopper</h1>
        <FollowAuthorButton action={action} />
      </main>,
    );
  },
});

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/', AuthorPage),
});
