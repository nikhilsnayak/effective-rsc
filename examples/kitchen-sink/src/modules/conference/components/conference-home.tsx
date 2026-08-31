import { Effect } from 'effect';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ERSC } from '@/ersc';
import { cn } from '@/lib/utils';
import type { Conference, ObservedQuery } from '@/modules/conference/model';
import { ConferenceService } from '@/modules/conference/service';

type ConferenceHomeProps = {
  readonly conference: ObservedQuery<Conference>;
};

const days = [
  {
    date: '22 August',
    description: 'Architecture, runtime foundations, and designing for interruption.',
    href: '/schedule/saturday',
    label: 'Saturday',
  },
  {
    date: '23 August',
    description: 'Caching, mutation protocols, and what the browser now does for you.',
    href: '/schedule/sunday',
    label: 'Sunday',
  },
] as const;

function ConferenceHomeView({ conference }: ConferenceHomeProps) {
  return (
    <main className='mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16'>
      <header className='max-w-3xl border-b pb-9'>
        <Badge variant='outline'>{conference.data.year}</Badge>
        <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl'>
          {conference.data.name}
        </h1>
        <p className='text-muted-foreground mt-4 text-lg leading-8 text-pretty'>
          {conference.data.tagline}
        </p>
        <div className='text-muted-foreground mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
          <span className='inline-flex items-center gap-1.5'>
            <CalendarDays aria-hidden='true' className='size-4' />
            {conference.data.dates}
          </span>
          <span className='inline-flex items-center gap-1.5'>
            <MapPin aria-hidden='true' className='size-4' />
            {`${conference.data.venue}, ${conference.data.location}`}
          </span>
        </div>
      </header>

      <section className='grid gap-4 py-9 sm:grid-cols-2' aria-label='Conference days'>
        {days.map((day) => (
          <Card key={day.href}>
            <CardHeader>
              <Badge variant='outline'>{day.date}</Badge>
              <CardTitle className='mt-3 text-2xl tracking-[-0.02em]'>{day.label}</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col items-start gap-5'>
              <p className='text-muted-foreground leading-7 text-pretty'>{day.description}</p>
              <a
                aria-label={`See the ${day.label} schedule`}
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={day.href}
              >
                {`See ${day.label}`}
                <ArrowRight aria-hidden='true' />
              </a>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

export const ConferenceHomePage = ERSC.Page.make({
  render: Effect.fn('ConferenceHomePage')(function* () {
    const service = yield* ConferenceService;
    const conference = yield* service.conference;

    return <ConferenceHomeView conference={conference} />;
  }),
});
