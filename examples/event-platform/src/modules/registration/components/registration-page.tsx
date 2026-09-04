import { Effect, Schema } from 'effect';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ERSC } from '@/ersc';
import { cn } from '@/lib/utils';
import { PublicEventMissing } from '@/modules/event/components/public-event-missing';
import { PublishedEventNotFound } from '@/modules/event/model';
import { EventService } from '@/modules/event/service';
import { RegistrationForm } from '@/modules/registration/components/registration-form';
import { RegistrationService } from '@/modules/registration/service';
import { WaitlistForm } from '@/modules/waitlist/components/waitlist-form';

export const RegistrationPage = ERSC.Page.make({
  params: Schema.Struct({
    eventSlug: Schema.String,
    organizationSlug: Schema.String,
  }),
  render: Effect.fn('RegistrationPage')(function* ({ params }) {
    const events = yield* EventService;
    const registration = yield* RegistrationService;
    const event = yield* events
      .getPublished(params.organizationSlug, params.eventSlug)
      .pipe(Effect.catchIf(Schema.is(PublishedEventNotFound), () => Effect.succeed(null)));
    if (event === null) {
      return (
        <NavigationTransition key='registration-missing'>
          <PublicEventMissing />
        </NavigationTransition>
      );
    }
    if (event.status !== 'published') {
      return (
        <NavigationTransition key={`registration-closed-${event.eventId}`}>
          <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
            <p className='text-muted-foreground text-sm font-medium'>Registration closed</p>
            <h1 className='mt-3 text-3xl font-semibold tracking-[-0.03em]'>
              {event.name} has ended.
            </h1>
            <p className='text-muted-foreground mt-3 leading-7'>
              Registration is no longer available, but its published programme remains online.
            </p>
            <a
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-7')}
              href={`/events/${event.organizationSlug}/${event.eventSlug}`}
            >
              Event overview
            </a>
          </main>
        </NavigationTransition>
      );
    }
    const tickets = yield* registration.listTickets(event.eventId);
    const questions = yield* registration.listQuestions(event.eventId);

    return (
      <NavigationTransition key={`registration-${event.eventId}`}>
        <main className='mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:py-16'>
          <header className='max-w-3xl border-b pb-8'>
            <Badge variant='outline'>{event.organizationName}</Badge>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance'>
              Register for {event.name}
            </h1>
            <p className='text-muted-foreground mt-3 leading-7'>{event.tagline}</p>
          </header>
          <div className='grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-14'>
            <div>
              <RegistrationForm eventId={event.eventId} questions={questions} tickets={tickets} />
              <WaitlistForm
                eventId={event.eventId}
                tickets={tickets.filter((ticket) => ticket.available === 0)}
              />
            </div>
            <aside className='border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8'>
              <h2 className='font-semibold'>Checkout guarantees</h2>
              <ul className='text-muted-foreground mt-4 grid gap-3 text-sm leading-6'>
                <li>Inventory is reserved atomically before payment.</li>
                <li>Declines release the reservation.</li>
                <li>Repeated submissions use one idempotent order.</li>
                <li>Discount usage and inventory are reserved together.</li>
                <li>A ticket is issued only after payment succeeds.</li>
              </ul>
            </aside>
          </div>
        </main>
      </NavigationTransition>
    );
  }),
});
