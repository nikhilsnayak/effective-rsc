import { Effect } from 'effect';
import { MapPin } from 'lucide-react';

import { ERSC } from '@/ersc';
import { ConferenceRepository } from '@/modules/conference/conference-repository';

export default ERSC.Layout.make({
  render: Effect.fn('ConferenceShell')(function* ({ children }) {
    const repository = yield* ConferenceRepository;
    const conference = yield* repository.conference;

    return (
      <html
        lang='en'
        data-conference-completed-at={conference.completedAt}
        data-conference-started-at={conference.startedAt}
      >
        <head>
          <title>{`${conference.data.name} ${conference.data.year} — Conference schedule`}</title>
          <meta name='description' content={conference.data.tagline} />
        </head>
        <body>
          <header className='bg-background border-b'>
            <div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8'>
              <a
                className='flex items-center gap-3'
                href='/schedule/saturday'
                aria-label='Converge home'
              >
                <span className='bg-foreground text-background grid size-9 place-items-center rounded-md font-mono text-xs font-semibold'>
                  C26
                </span>
                <span>
                  <span className='block leading-none font-semibold'>{conference.data.name}</span>
                  <span className='text-muted-foreground mt-1 block text-xs'>
                    {conference.data.dates}
                  </span>
                </span>
              </a>
              <div className='text-muted-foreground hidden items-center gap-2 text-sm sm:flex'>
                <MapPin aria-hidden='true' className='size-4' />
                {conference.data.location}
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
