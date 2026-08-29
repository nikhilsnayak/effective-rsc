/**
 * @title Composing and mounting Routes
 *
 * Mounting retains the child graph's Layout and Loading ancestry.
 */
import { ERSC } from './10_ersc';
import { ArticleLayout, ArticleLoading, RootLayout } from './10_layouts';
import { ArticlePage, HomePage } from './20_pages';
import { ArticleResponsePolicy } from './25_middleware';

const articleRoutes = ERSC.Routes.make({
  layout: ArticleLayout,
  loading: ArticleLoading,
  middleware: [ArticleResponsePolicy],
}).page('/:slug', ArticlePage);

export const applicationRoutes = ERSC.Routes.make({ layout: RootLayout })
  .page('/', HomePage)
  .mount('/articles', articleRoutes);
