import { DateTime, Effect } from 'effect';
import { ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react';
import { ViewTransition } from 'react';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ERSC } from '@/ersc';
import { cn } from '@/lib/utils';
import type { EventSummary } from '@/modules/event/model';
import { EventService } from '@/modules/event/service';

const eventDate = (event: EventSummary) =>
  DateTime.formatUtc(DateTime.makeUnsafe(event.startsAt), {
    day: 'numeric',
    locale: 'en',
    month: 'short',
    year: 'numeric',
  });

function EventCard({ event }: { readonly event: EventSummary }) {
  return (
    <Card className='flex h-full flex-col'>
      <CardHeader>
        <div className='flex items-center justify-between gap-3'>
          <Badge variant='outline'>
            {event.status === 'completed' ? 'Past event' : 'Registration soon'}
          </Badge>
          <span className='text-muted-foreground text-xs'>{event.organizationName}</span>
        </div>
        <CardTitle className='mt-4 text-2xl tracking-[-0.02em]'>{event.name}</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col items-start'>
        <p className='text-muted-foreground leading-7 text-pretty'>{event.tagline}</p>
        <dl className='text-muted-foreground mt-6 grid gap-2 text-sm'>
          <div className='flex items-center gap-2'>
            <CalendarDays aria-hidden='true' className='size-4' />
            <dd>{eventDate(event)}</dd>
          </div>
          <div className='flex items-center gap-2'>
            <MapPin aria-hidden='true' className='size-4' />
            <dd>{`${event.venueName}, ${event.locality}`}</dd>
          </div>
          <div className='flex items-center gap-2'>
            <Users aria-hidden='true' className='size-4' />
            <dd>{`${event.capacity} places`}</dd>
          </div>
        </dl>
        <a
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-7')}
          href={`/events/${event.organizationSlug}/${event.eventSlug}`}
        >
          Event details
          <ArrowRight aria-hidden='true' data-icon='inline-end' />
        </a>
      </CardContent>
    </Card>
  );
}

export const EventCatalogPage = ERSC.Page.make({
  render: Effect.fn('EventCatalogPage')(function* () {
    const service = yield* EventService;
    const events = yield* service.listPublished;

    return (
      <NavigationTransition>
        <main className='mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16'>
          <header className='max-w-3xl border-b pb-9'>
            <Badge variant='outline'>Curated professional events</Badge>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl'>
              Events worth showing up for.
            </h1>
            <p className='text-muted-foreground mt-4 text-lg leading-8 text-pretty'>
              Find focused, in-person gatherings from independent organizers. Every event page,
              programme, and attendee workflow is served by the same platform.
            </p>
          </header>

          <section className='py-9' aria-labelledby='events-heading'>
            <div className='flex items-end justify-between gap-4'>
              <div>
                <p className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
                  Event catalog
                </p>
                <h2 id='events-heading' className='mt-2 text-2xl font-semibold tracking-[-0.02em]'>
                  Published events
                </h2>
              </div>
              <span className='text-muted-foreground text-sm'>{`${events.length} events`}</span>
            </div>
            {events.length === 0 ? (
              <Empty className='border-border mt-6 border'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <CalendarDays aria-hidden='true' />
                  </EmptyMedia>
                  <EmptyTitle>No published events</EmptyTitle>
                  <EmptyDescription>
                    Published events will appear here for attendees.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className='mt-6 grid gap-4 md:grid-cols-2'>
                {events.map((event) => (
                  <ViewTransition
                    default='none'
                    enter='reveal-in'
                    exit='reveal-out'
                    key={event.eventId}
                    update='auto'
                  >
                    <EventCard event={event} />
                  </ViewTransition>
                ))}
              </div>
            )}
          </section>
        </main>
      </NavigationTransition>
    );
  }),
});
