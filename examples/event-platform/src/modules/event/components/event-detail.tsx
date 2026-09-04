import { DateTime, Effect, Schema } from 'effect';
import { ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ERSC } from '@/ersc';
import { cn } from '@/lib/utils';
import { PublicEventMissing } from '@/modules/event/components/public-event-missing';
import type { EventSummary } from '@/modules/event/model';
import { PublishedEventNotFound } from '@/modules/event/model';
import { EventService } from '@/modules/event/service';

const eventDate = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), { dateStyle: 'long', locale: 'en' });

function EventDetail({ event }: { readonly event: EventSummary }) {
  return (
    <main className='mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16'>
      <div className='grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16'>
        <article>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline'>
              {event.status === 'completed' ? 'Completed' : 'Published'}
            </Badge>
            <span className='text-muted-foreground text-sm'>{event.organizationName}</span>
          </div>
          <h1 className='mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl'>
            {event.name}
          </h1>
          <p className='text-muted-foreground mt-4 max-w-2xl text-lg leading-8 text-pretty'>
            {event.tagline}
          </p>
          <p className='mt-9 max-w-2xl leading-7 text-pretty'>{event.description}</p>

          <div className='mt-8 flex flex-wrap gap-3'>
            {event.status === 'published' ? (
              <a
                className={cn(buttonVariants())}
                href={`/events/${event.organizationSlug}/${event.eventSlug}/register`}
              >
                Register now
                <ArrowRight aria-hidden='true' data-icon='inline-end' />
              </a>
            ) : null}
            <a
              className={cn(buttonVariants({ variant: 'outline' }))}
              href={`/events/${event.organizationSlug}/${event.eventSlug}/programme`}
            >
              View programme
            </a>
          </div>
        </article>

        <aside className='border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8'>
          <h2 className='font-semibold'>Event details</h2>
          <dl className='text-muted-foreground mt-5 grid gap-5 text-sm'>
            <div className='flex gap-3'>
              <CalendarDays aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
              <div>
                <dt className='text-foreground font-medium'>Dates</dt>
                <dd className='mt-1'>{`${eventDate(event.startsAt)} – ${eventDate(event.endsAt)}`}</dd>
                <dd className='mt-1 text-xs'>{event.timezone}</dd>
              </div>
            </div>
            <div className='flex gap-3'>
              <MapPin aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
              <div>
                <dt className='text-foreground font-medium'>Venue</dt>
                <dd className='mt-1'>{event.venueName}</dd>
                <dd>{`${event.locality}, ${event.countryCode}`}</dd>
              </div>
            </div>
            <div className='flex gap-3'>
              <Users aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
              <div>
                <dt className='text-foreground font-medium'>Capacity</dt>
                <dd className='mt-1'>{`${event.capacity} attendees`}</dd>
              </div>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

export const EventDetailPage = ERSC.Page.make({
  params: Schema.Struct({
    eventSlug: Schema.String,
    organizationSlug: Schema.String,
  }),
  render: Effect.fn('EventDetailPage')(function* ({ params }) {
    const service = yield* EventService;
    const event = yield* service
      .getPublished(params.organizationSlug, params.eventSlug)
      .pipe(
        Effect.catch((error) =>
          Schema.is(PublishedEventNotFound)(error) ? Effect.succeed(null) : Effect.fail(error),
        ),
      );

    return (
      <NavigationTransition key={`event-${event?.eventId ?? 'missing'}`}>
        {event === null ? <PublicEventMissing /> : <EventDetail event={event} />}
      </NavigationTransition>
    );
  }),
});
