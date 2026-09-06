import { Effect, Schema } from 'effect';

import { Telemetry } from './components/telemetry';
import { ThemeToggle } from './components/theme-toggle';
import { TooltipProvider } from './components/ui/tooltip';
import { DocumentationLayout } from './docs/layout';
import type { DocEntry } from './docs/model';
import { DocumentationPage } from './docs/page';
import { Docs, readRequiredDocument, resolveDocument } from './docs/service';
import { ERSC } from './ersc';
import { Home } from './home';
import { cachePublicPage } from './page-cache';

import './styles.css';

const PublicERSC = ERSC.withMiddleware(ERSC.Middleware.make(cachePublicPage));

// Apply the saved theme before paint; only this attribute differs from the server document.
const themeScript = `try{const t=localStorage.getItem('ersc-theme');document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch{document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}`;

const RootLayout = ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en' suppressHydrationWarning className='scroll-pt-24 scrollbar-gutter-stable'>
        <head>
          <meta name='viewport' content='width=device-width, initial-scale=1' />
          <link rel='stylesheet' href='/fonts.css' />
          <link
            rel='icon'
            href='/generated/logo.svg'
            type='image/svg+xml'
            media='(prefers-color-scheme: light)'
          />
          <link
            rel='icon'
            href='/generated/logo-dark.svg'
            type='image/svg+xml'
            media='(prefers-color-scheme: dark)'
          />
          <link
            rel='preload'
            href='/generated/geist.woff2'
            as='font'
            type='font/woff2'
            crossOrigin='anonymous'
          />
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className='bg-background text-foreground selection:bg-primary/20 [&_a:focus-visible]:outline-ring font-sans antialiased [&_a]:outline-offset-4 [&_a:focus-visible]:outline-2'>
          <TooltipProvider delay={300}>
            <a
              className='bg-background fixed -top-20 left-4 z-50 p-3 focus:top-4'
              href='#main-content'
            >
              Skip to content
            </a>
            <header
              className='bg-background sticky top-0 z-20 border-b print:hidden'
              style={{ viewTransitionName: 'site-header' }}
            >
              <div className='mx-auto flex h-16 max-w-330 items-center gap-2 px-4 md:h-18 md:gap-4 md:px-8'>
                <a
                  className='inline-flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-tight'
                  href='/'
                >
                  <img
                    className='dark:hidden'
                    src='/generated/logo.svg'
                    width={25}
                    height={25}
                    alt=''
                  />
                  <img
                    className='hidden dark:block'
                    src='/generated/logo-dark.svg'
                    width={25}
                    height={25}
                    alt=''
                  />
                  <span>effective-rsc</span>
                </a>
                <nav
                  aria-label='Main navigation'
                  className='text-muted-foreground ml-auto flex items-center gap-4 text-sm md:gap-6'
                >
                  <a className='hover:text-foreground' href='/'>
                    Home
                  </a>
                  <a className='hover:text-foreground' href='/docs'>
                    Docs
                  </a>
                  <a
                    className='hover:text-foreground hidden md:inline'
                    href='https://github.com/nikhilsnayak/effective-rsc'
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    GitHub
                  </a>
                </nav>
                <ThemeToggle />
              </div>
            </header>
            <main
              id='main-content'
              tabIndex={-1}
              className='min-h-[calc(100dvh-11rem)] outline-none'
            >
              {children}
            </main>
            <footer className='text-muted-foreground bg-background relative z-10 mx-auto flex max-w-330 items-start justify-between gap-4 border-t px-5 py-6 text-xs md:items-center md:px-8 print:hidden'>
              <div>
                <span>Built with effective-rsc</span>
              </div>
              <nav aria-label='Footer' className='flex flex-wrap gap-3 md:gap-6'>
                <a className='hover:text-foreground' href='/generated/LLMS.md'>
                  LLMS.md
                </a>
                <a
                  className='hover:text-foreground'
                  href='https://github.com/nikhilsnayak/effective-rsc'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Source
                </a>
                <a
                  className='hover:text-foreground'
                  href='https://nikhilsnayak.dev'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Nikhil S <span aria-hidden='true'>↗</span>
                </a>
              </nav>
            </footer>
          </TooltipProvider>
          <Telemetry />
        </body>
      </html>,
    ),
});

const HomePage = ERSC.Page.make({
  render: () => Effect.succeed(<Home />),
});
const DocsOverviewPage = ERSC.Page.make({
  render: Effect.fn('DocsOverviewPage.render')(function* () {
    const docs = yield* Docs;
    const page = yield* readRequiredDocument('/docs');
    return <DocumentationPage page={page} entries={docs.entries} />;
  }),
});

const DocsLayout = ERSC.Layout.make({
  render: Effect.fn('DocsLayout.render')(function* ({ children }) {
    const docs = yield* Docs;
    return <DocumentationLayout entries={docs.entries}>{children}</DocumentationLayout>;
  }),
});

const renderDocument = Effect.fn('DocumentationPage.render')(function* ({
  params: entry,
}: {
  readonly params: DocEntry;
}) {
  const docs = yield* Docs;
  const page = yield* docs.read(entry);
  return <DocumentationPage page={page} entries={docs.entries} />;
});

const SectionPage = ERSC.Page.make({
  params: resolveDocument(
    Schema.Struct({ section: Schema.String }),
    ({ section }) => `/docs/${section}`,
  ),
  render: renderDocument,
});
const DocumentPage = ERSC.Page.make({
  params: resolveDocument(
    Schema.Struct({ section: Schema.String, document: Schema.String }),
    ({ section, document }) => `/docs/${section}/${document}`,
  ),
  render: renderDocument,
});
const ExamplePage = ERSC.Page.make({
  params: resolveDocument(
    Schema.Struct({ section: Schema.String, document: Schema.String, example: Schema.String }),
    ({ section, document, example }) => `/docs/${section}/${document}/${example}`,
  ),
  render: renderDocument,
});
const docsRoutes = ERSC.Routes.make({ layout: DocsLayout })
  .page('/', DocsOverviewPage)
  .page('/:section', SectionPage)
  .page('/:section/:document', DocumentPage)
  .page('/:section/:document/:example', ExamplePage);
const routes = PublicERSC.Routes.make({ layout: RootLayout })
  .page('/', HomePage)
  .mount('/docs', docsRoutes);

export default ERSC.make({ routes, layer: Docs.layer });
