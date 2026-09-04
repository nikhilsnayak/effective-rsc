import { Effect } from 'effect';
import { Layers3 } from 'lucide-react';

import { ERSC } from '@/ersc';

export default ERSC.Layout.make({
  render: ({ children }) =>
    Effect.succeed(
      <html lang='en'>
        <head>
          <title>Gather — events worth showing up for</title>
          <meta
            name='description'
            content='Discover and manage focused professional events on Gather.'
          />
          <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
        </head>
        <body>
          <header className='bg-background border-b'>
            <div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8'>
              <a
                className='flex items-center gap-2.5 font-semibold'
                href='/'
                aria-label='Gather home'
              >
                <span className='bg-foreground text-background grid size-8 place-items-center rounded-md'>
                  <Layers3 aria-hidden='true' className='size-4' />
                </span>
                Gather
              </a>
              <nav aria-label='Primary navigation' className='flex items-center gap-5'>
                <a className='text-muted-foreground hover:text-foreground text-sm' href='/'>
                  Explore events
                </a>
                <a
                  className='text-muted-foreground hover:text-foreground text-sm'
                  href='/organizer'
                >
                  Organizer studio
                </a>
                <a className='text-muted-foreground hover:text-foreground text-sm' href='/attendee'>
                  My tickets
                </a>
              </nav>
            </div>
          </header>

          {children}

          <footer className='border-t'>
            <div className='text-muted-foreground mx-auto flex max-w-7xl flex-col gap-1 px-5 py-6 text-xs sm:px-8 lg:flex-row lg:justify-between'>
              <span>Gather is a fictional event platform built to exercise effective-rsc.</span>
              <span>All events, organizations, and people are demonstration data.</span>
            </div>
          </footer>
        </body>
      </html>,
    ),
});
