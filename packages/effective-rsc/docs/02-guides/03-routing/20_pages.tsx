/**
 * @title Static and parameterized Pages
 *
 * A Page Schema decodes captured path strings for render.
 */
import { Effect, Schema } from 'effect';

import { ERSC } from './10_ersc';

export const HomePage = ERSC.Page.make({
  render: () => Effect.succeed(<h1>Publishing home</h1>),
});

export const ArticlePage = ERSC.Page.make({
  params: Schema.Struct({ slug: Schema.NonEmptyString }),
  render: ({ params }) =>
    Effect.succeed(
      <article>
        <h2>{params.slug}</h2>
        <p>This article belongs to the mounted article route scope.</p>
      </article>,
    ),
});
