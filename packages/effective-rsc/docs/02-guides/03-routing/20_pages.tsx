/**
 * @title Static and parameterized Pages
 *
 * A Page Schema decodes captured path strings for render.
 */
import { Effect, Schema } from 'effect';

import { ERSC } from './01_application';

export const HomePage = ERSC.Page.make({
  render: () => Effect.succeed(<h1>Publishing home</h1>),
});

export const ArticlePage = ERSC.Page.make({
  params: Schema.Struct({ slug: Schema.NonEmptyString }),
  render: ({ params }) =>
    Effect.succeed(
      <article>
        <h2>{params.slug}</h2>
        <p>Article content streams here.</p>
      </article>,
    ),
});
