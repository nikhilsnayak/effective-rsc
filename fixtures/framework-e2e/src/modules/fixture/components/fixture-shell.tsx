import { Effect } from 'effect';
import { FlaskConical } from 'lucide-react';
import { ViewTransition } from 'react';

import { ERSC } from '@/ersc';
import { FixtureService } from '@/modules/fixture/service';

export default ERSC.Layout.make({
  render: Effect.fn('FixtureShell')(function* ({ children }) {
    const service = yield* FixtureService;
    const fixture = yield* service.fixture;

    return (
      <ViewTransition
        default='none'
        update={{
          default: 'none',
          'hmr-refresh': 'auto',
          navigation: 'auto',
          'server-function': 'auto',
        }}
      >
        <html
          lang='en'
          data-fixture-completed-at={fixture.completedAt}
          data-fixture-started-at={fixture.startedAt}
        >
          <head>
            <title>{`${fixture.data.name} — Integration contracts`}</title>
            <meta name='description' content={fixture.data.description} />
            <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
          </head>
          <body>
            <header className='bg-background border-b'>
              <div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8'>
                <a
                  className='flex items-center gap-3'
                  href='/'
                  aria-label={`${fixture.data.name} home`}
                >
                  <svg aria-hidden='true' className='size-9 shrink-0' viewBox='0 0 64 64'>
                    <rect x='16' y='27.5' width='26' height='9' rx='4.5' fill='var(--primary)' />
                    <rect x='16' y='11' width='9' height='42' rx='4.5' fill='var(--foreground)' />
                    <rect x='16' y='11' width='32' height='9' rx='4.5' fill='var(--foreground)' />
                    <rect x='16' y='44' width='32' height='9' rx='4.5' fill='var(--foreground)' />
                  </svg>
                  <span>
                    <span className='block leading-none font-semibold'>{fixture.data.name}</span>
                    <span className='text-muted-foreground mt-1 block text-xs'>
                      {fixture.data.revision}
                    </span>
                  </span>
                </a>
                <div className='text-muted-foreground hidden items-center gap-4 text-sm sm:flex'>
                  <a className='hover:text-foreground' href='/catalog'>
                    Catalog
                  </a>
                  <span className='inline-flex items-center gap-2'>
                    <FlaskConical aria-hidden='true' className='size-4' />
                    Integration-only
                  </span>
                </div>
              </div>
            </header>

            {children}

            <footer className='border-t'>
              <div className='text-muted-foreground mx-auto flex max-w-7xl flex-col gap-1 px-5 py-6 text-xs sm:px-8 lg:flex-row lg:justify-between'>
                <span>{fixture.data.description}</span>
                <span>{fixture.data.storage}</span>
              </div>
            </footer>
          </body>
        </html>
      </ViewTransition>
    );
  }),
});
