/**
 * @title Composing and mounting Routes
 *
 * Mounting retains the child graph's Layout and Loading ancestry.
 */
import { ERSC } from './10_ersc';
import { ArticleLayout, ArticleLoading, RootLayout } from './10_layouts';
import { ArticlePage, HomePage } from './20_pages';
import { ArticleERSC } from './25_middleware';

const articleRoutes = ArticleERSC.Routes.make({
  layout: ArticleLayout,
  loading: ArticleLoading,
}).page('/:slug', ArticlePage);

export const applicationRoutes = ERSC.Routes.make({ layout: RootLayout })
  .page('/', HomePage)
  .mount('/articles', articleRoutes);
