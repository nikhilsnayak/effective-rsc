import { DateTime, Effect, Schema } from 'effect';
import { ArrowLeft, CalendarCog, ExternalLink, ListTree, ShieldCheck, Ticket } from 'lucide-react';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import {
  EventDetailsForm,
  TicketTypeForm,
} from '@/modules/event-authoring/components/authoring-forms';
import { EventAuthoringAccessDenied } from '@/modules/event-authoring/model';
import { EventAuthoringService } from '@/modules/event-authoring/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

const localDateTime = (value: string, timezone: string) =>
  DateTime.format(DateTime.makeZonedUnsafe(value, { timeZone: timezone }), {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    locale: 'sv-SE',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .replace(' ', 'T')
    .replaceAll('/', '-');

function AccessDenied() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>
          Event editor access required
        </h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          Your demo organizer role cannot edit this event or organization.
        </p>
      </main>
    </NavigationTransition>
  );
}

export const CreateEventPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ organizationId: Schema.String }),
  render: Effect.fn('CreateEventPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* EventAuthoringService;
    const organization = yield* service
      .createTarget(userId, params.organizationId)
      .pipe(Effect.catchIf(Schema.is(EventAuthoringAccessDenied), () => Effect.succeed(null)));
    if (organization === null) {
      return <AccessDenied />;
    }

    return (
      <NavigationTransition>
        <main className='mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:py-14'>
          <a
            className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
            href='/organizer'
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            Organizer studio
          </a>
          <header className='mt-6 border-b pb-8'>
            <Badge variant='outline'>{organization.name}</Badge>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>Create an event</h1>
            <p className='text-muted-foreground mt-3 leading-7'>
              Start with a private draft. Ticket sales remain unavailable until you publish it.
            </p>
          </header>
          <section className='py-9' aria-labelledby='new-event-details'>
            <h2 className='sr-only' id='new-event-details'>
              Event details
            </h2>
            <EventDetailsForm
              key={`create-${organization.organizationId}`}
              organizationId={organization.organizationId}
            />
          </section>
        </main>
      </NavigationTransition>
    );
  }),
});

export const EditEventPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('EditEventPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* EventAuthoringService;
    const editor = yield* service
      .editor(userId, params.eventId)
      .pipe(Effect.catchIf(Schema.is(EventAuthoringAccessDenied), () => Effect.succeed(null)));
    if (editor === null) {
      return <AccessDenied />;
    }
    const event = {
      ...editor.event,
      endsAt: localDateTime(editor.event.endsAt, editor.event.timezone),
      startsAt: localDateTime(editor.event.startsAt, editor.event.timezone),
    };
    const tickets = editor.tickets.map((ticketType) => ({
      ...ticketType,
      salesEndsAt: localDateTime(ticketType.salesEndsAt, editor.event.timezone),
      salesStartsAt: localDateTime(ticketType.salesStartsAt, editor.event.timezone),
    }));

    return (
      <NavigationTransition key={`event-editor-${editor.event.eventId}`}>
        <main className='mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14'>
          <a
            className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
            href='/organizer'
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            Organizer studio
          </a>
          <header className='mt-6 flex flex-col justify-between gap-5 border-b pb-8 md:flex-row md:items-end'>
            <div>
              <div className='flex flex-wrap gap-2'>
                <Badge variant='outline'>{editor.event.organizationName}</Badge>
                <Badge variant='secondary'>{editor.event.status}</Badge>
              </div>
              <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
                {editor.event.name}
              </h1>
              <p className='text-muted-foreground mt-3 inline-flex items-center gap-2 text-sm'>
                <CalendarCog aria-hidden='true' className='size-4' />
                Event details and ticket inventory
              </p>
            </div>
            <div className='flex flex-wrap gap-4'>
              {editor.event.status === 'published' || editor.event.status === 'completed' ? (
                <a
                  className='inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4'
                  href={`/events/${editor.event.organizationSlug}/${editor.event.eventSlug}`}
                >
                  Public page
                  <ExternalLink aria-hidden='true' className='size-3.5' />
                </a>
              ) : null}
              <a
                className='inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4'
                href={`/organizer/events/${editor.event.eventId}/programme`}
              >
                <ListTree aria-hidden='true' className='size-3.5' />
                Manage programme
              </a>
            </div>
          </header>

          <section className='border-b py-9' aria-labelledby='event-details-heading'>
            <h2 id='event-details-heading' className='mb-6 text-2xl font-semibold'>
              Event details
            </h2>
            <EventDetailsForm
              defaults={event}
              key={`edit-${event.eventId}`}
              organizationId={event.organizationId}
            />
          </section>

          <section className='py-9' aria-labelledby='ticket-types-heading'>
            <div className='mb-6 flex items-center gap-2'>
              <Ticket aria-hidden='true' className='size-5' />
              <h2 id='ticket-types-heading' className='text-2xl font-semibold'>
                Ticket types
              </h2>
            </div>
            <div className='grid gap-5'>
              {tickets.map((ticketType) => (
                <TicketTypeForm
                  eventId={editor.event.eventId}
                  key={ticketType.ticketTypeId}
                  ticket={ticketType}
                />
              ))}
              <TicketTypeForm eventId={editor.event.eventId} />
            </div>
          </section>
        </main>
      </NavigationTransition>
    );
  }),
});
