/**
 * @title Layout and Loading concerns
 *
 * Layout is Effectful; Loading is synchronous and service-free.
 */
import { Effect } from 'effect';

import { ERSC } from './10_ersc';

export const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <body>
          <nav>
            <a href='/'>Home</a> · <a href='/articles/effectful-rsc'>Article</a>
          </nav>
          {children}
        </body>
      </html>,
    ),
});

export const ArticleLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <section>
        <h1>Articles</h1>
        {children}
      </section>,
    ),
});

export const ArticleLoading = ERSC.Loading.make({
  render: () => <p>Loading article…</p>,
});
