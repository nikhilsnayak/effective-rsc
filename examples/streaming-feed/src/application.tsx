import { RegistryProvider } from '@effect/atom-react';
import { Effect, Layer } from 'effect';

import { Database } from './database';
import { ERSC } from './ersc';
import { Feed } from './feed';
import { FeedService } from './service';
import { renderStory } from './story-card';

import './styles.css';

const Layout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <head>
          <title>Fieldnotes</title>
          <meta name='viewport' content='width=device-width, initial-scale=1' />
          <meta
            name='description'
            content='A reading feed on design, technology, and everyday life.'
          />
        </head>
        <body id='top'>
          <a className='skip-link' href='#main-content'>
            Skip to content
          </a>
          <div className='page-shell'>
            <header className='site-header'>
              <a className='wordmark' href='/'>
                <span aria-hidden='true' /> fieldnotes
              </a>
              <nav aria-label='Main navigation'>
                <a href='/'>feed</a>
                <a href='/about'>about</a>
              </nav>
            </header>
            <RegistryProvider>
              <main id='main-content' tabIndex={-1}>
                {children}
              </main>
            </RegistryProvider>
            <footer className='site-footer'>
              <span>an effective-rsc example</span>
              <a href='#top'>back to top ↑</a>
            </footer>
          </div>
        </body>
      </html>,
    ),
});

const Home = ERSC.Page.make({
  render: Effect.fn('Home')(function* () {
    const feed = yield* FeedService;
    const initial = yield* feed.page(0);
    return (
      <>
        <section className='intro'>
          <h1>
            notes<span className='accent'>.</span>
          </h1>
          <p>
            A reading feed on design, technology, and everyday life. Open a note, or scroll for
            more.
          </p>
        </section>
        <Feed seed={{ items: initial.map(renderStory), total: feed.total }} />
      </>
    );
  }),
});

const About = ERSC.Page.make({
  render: () =>
    Effect.succeed(
      <section className='about'>
        <h1>
          about this feed<span className='accent'>.</span>
        </h1>
        <p>
          Fieldnotes is a demo of a streaming reading feed. All 10,000 notes and their authors are
          fictional.
        </p>
        <p>
          Scroll to load more entries. Each note opens in place, so you can keep reading without
          leaving the list.
        </p>
        <a className='back-link' href='/'>
          ← Back to the notes
        </a>
      </section>,
    ),
});

export default ERSC.make({
  layer: FeedService.layer.pipe(Layer.provide(Database.layer)),
  routes: ERSC.Routes.make({ layout: Layout }).page('/', Home).page('/about', About),
});
