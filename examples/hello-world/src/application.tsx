import { Effect } from 'effect';
import { Suspense } from 'react';

import { Counter } from './counter';
import { ERSC } from './ersc';
import { GreetingForm } from './greeting-form';

import './styles.css';

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <head>
          <title>Hello world · effective-rsc</title>
          <meta name='viewport' content='width=device-width, initial-scale=1' />
          <meta
            name='description'
            content='An effective-rsc example with streaming and Server Functions.'
          />
          <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
        </head>
        <body>
          <div className='shell'>
            <header>
              <a className='brand' href='/'>
                <img src='/favicon.svg' alt='' width={28} height={28} />
                effective-rsc
              </a>
              <nav aria-label='Main navigation'>
                <a href='/'>Home</a>
                <a href='/about'>About</a>
              </nav>
            </header>
            <main>{children}</main>
            <aside aria-label='Client counter' className='card'>
              <h2>Client state</h2>
              <p>Increment the counter, then visit About. The shared layout keeps its state.</p>
              <Counter />
            </aside>
            <footer>Built with effective-rsc</footer>
          </div>
        </body>
      </html>,
    ),
});

const StreamedMessage = ERSC.Component.make({
  render: () =>
    Effect.sleep('1 second').pipe(
      Effect.as(<p className='response'>Rendered on the server after a one-second delay.</p>),
    ),
});

const HomePage = ERSC.Page.make({
  render: () =>
    Effect.succeed(
      <>
        <h1>Hello world</h1>
        <p>Server rendering, streaming, and client state in one example.</p>
        <section className='card'>
          <h2>Server Function</h2>
          <p>Submit a name to generate a greeting on the server.</p>
          <GreetingForm />
        </section>
        <section className='card'>
          <h2>Streaming</h2>
          <Suspense fallback={<output className='response'>Loading server content…</output>}>
            <StreamedMessage />
          </Suspense>
        </section>
      </>,
    ),
});

const AboutPage = ERSC.Page.make({
  render: () =>
    Effect.succeed(
      <>
        <h1>About this example</h1>
        <p>Both routes share a layout. Navigating between them preserves the counter below.</p>
        <p>
          The home page uses Suspense to stream server content and a Server Function to handle form
          submissions. The form also works without JavaScript.
        </p>
        <a href='/'>Back to home</a>
      </>,
    ),
});

export default ERSC.make({
  routes: ERSC.Routes.make({ layout: RootLayout }).page('/', HomePage).page('/about', AboutPage),
});
