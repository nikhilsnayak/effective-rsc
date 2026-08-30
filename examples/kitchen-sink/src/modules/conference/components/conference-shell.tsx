import { Effect } from 'effect';
import { MapPin } from 'lucide-react';

import { ERSC } from '@/ersc';
import { ConferenceService } from '@/modules/conference/service';

export default ERSC.Layout.make({
  render: Effect.fn('ConferenceShell')(function* ({ children }) {
    const service = yield* ConferenceService;
    const conference = yield* service.conference;

    return (
      <html
        lang='en'
        data-conference-completed-at={conference.completedAt}
        data-conference-started-at={conference.startedAt}
      >
        <head>
          <title>{`${conference.data.name} ${conference.data.year} — Conference schedule`}</title>
          <meta name='description' content={conference.data.tagline} />
          <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
        </head>
        <body>
          <header className='bg-background border-b'>
            <div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8'>
              <a
                className='flex items-center gap-3'
                href='/'
                aria-label={`${conference.data.name} home`}
              >
                <svg aria-hidden='true' className='size-9 shrink-0' viewBox='0 0 64 64'>
                  <rect x='16' y='27.5' width='26' height='9' rx='4.5' fill='var(--primary)' />
                  <rect x='16' y='11' width='9' height='42' rx='4.5' fill='var(--foreground)' />
                  <rect x='16' y='11' width='32' height='9' rx='4.5' fill='var(--foreground)' />
                  <rect x='16' y='44' width='32' height='9' rx='4.5' fill='var(--foreground)' />
                </svg>
                <span>
                  <span className='block leading-none font-semibold'>{conference.data.name}</span>
                  <span className='text-muted-foreground mt-1 block text-xs'>
                    {conference.data.dates}
                  </span>
                </span>
              </a>
              <div className='text-muted-foreground hidden items-center gap-4 text-sm sm:flex'>
                <a className='hover:text-foreground' href='/schedule'>
                  Programme
                </a>
                <span className='inline-flex items-center gap-2'>
                  <MapPin aria-hidden='true' className='size-4' />
                  {conference.data.location}
                </span>
              </div>
            </div>
          </header>

          {children}

          <footer className='border-t'>
            <div className='text-muted-foreground mx-auto flex max-w-7xl flex-col gap-1 px-5 py-6 text-xs sm:px-8 lg:flex-row lg:justify-between'>
              <span>{conference.data.tagline}</span>
              <span>{conference.data.venue}</span>
            </div>
          </footer>
        </body>
      </html>
    );
  }),
});
