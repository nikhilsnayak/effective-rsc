import { DateTime, Effect, Schema } from 'effect';
import { CalendarDays, MapPin, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import { TicketHolderForm } from '@/modules/attendee/components/ticket-holder-form';
import { AttendeeHubERSC, CurrentAttendeeSession } from '@/modules/attendee/current-attendee';
import { AttendeeHubUnavailable, AttendeeTicketNotFound } from '@/modules/attendee/model';
import { AttendeeService } from '@/modules/attendee/service';

const eventDate = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), { dateStyle: 'long', locale: 'en' });

const credential = (code: string) =>
  Effect.tryPromise({
    catch: () => new AttendeeHubUnavailable({ operation: 'render ticket credential' }),
    try: () =>
      QRCode.toDataURL(`gather:ticket:${code}`, {
        color: { dark: '#171717', light: '#ffffff' },
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 224,
      }),
  });

function TicketNotFound() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>Ticket not found</h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          This credential does not belong to the current attendee session.
        </p>
      </main>
    </NavigationTransition>
  );
}

export const AttendeeTicketPage = AttendeeHubERSC.Page.make({
  params: Schema.Struct({ ticketCode: Schema.String }),
  render: Effect.fn('AttendeeTicketPage')(function* ({ params }) {
    const { token } = yield* CurrentAttendeeSession;
    const service = yield* AttendeeService;
    const ticket = yield* service
      .ticket(token, params.ticketCode)
      .pipe(
        Effect.catch((error) =>
          Schema.is(AttendeeTicketNotFound)(error) ? Effect.succeed(null) : Effect.fail(error),
        ),
      );

    if (ticket === null) {
      return <TicketNotFound />;
    }

    const qrCode = yield* credential(ticket.code);
    const total = new Intl.NumberFormat('en', {
      currency: ticket.currency,
      style: 'currency',
    }).format(ticket.totalMinor / 100);

    return (
      <NavigationTransition key={`ticket-${ticket.ticketId}`}>
        <main className='mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:py-16'>
          <header className='border-b pb-8'>
            <Badge variant={ticket.status === 'valid' ? 'default' : 'secondary'}>
              {ticket.status.replace('_', ' ')}
            </Badge>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>{ticket.eventName}</h1>
            <p className='text-muted-foreground mt-3'>{ticket.ticketTypeName}</p>
          </header>

          <div className='grid gap-10 py-9 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-14'>
            <section className='text-center' aria-labelledby='credential-code'>
              <img
                alt={`QR credential for ticket ${ticket.code}`}
                className='mx-auto size-56 rounded-lg border'
                height='224'
                src={qrCode}
                width='224'
              />
              <h2 id='credential-code' className='mt-4 font-mono font-semibold'>
                {ticket.code}
              </h2>
              <p className='text-muted-foreground mt-2 text-xs'>
                Present this credential at check-in.
              </p>
            </section>

            <div>
              <section aria-labelledby='ticket-details'>
                <h2 id='ticket-details' className='text-xl font-semibold'>
                  Ticket details
                </h2>
                <dl className='mt-5 grid gap-4 text-sm sm:grid-cols-2'>
                  <div>
                    <dt className='text-muted-foreground inline-flex items-center gap-1.5'>
                      <CalendarDays aria-hidden='true' className='size-4' /> Date
                    </dt>
                    <dd className='mt-1 font-medium'>{eventDate(ticket.startsAt)}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground inline-flex items-center gap-1.5'>
                      <MapPin aria-hidden='true' className='size-4' /> Venue
                    </dt>
                    <dd className='mt-1 font-medium'>{`${ticket.venueName}, ${ticket.locality}`}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>Order total</dt>
                    <dd className='mt-1 font-medium'>{total}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>Organizer</dt>
                    <dd className='mt-1 font-medium'>{ticket.organizationName}</dd>
                  </div>
                </dl>
              </section>

              <section className='mt-9 border-t pt-7' aria-labelledby='ticket-holder'>
                <h2 id='ticket-holder' className='text-xl font-semibold'>
                  Attendee
                </h2>
                <p className='text-muted-foreground mt-2 text-sm'>{ticket.holderEmail}</p>
                <TicketHolderForm holderName={ticket.holderName} ticketId={ticket.ticketId} />
              </section>
            </div>
          </div>
        </main>
      </NavigationTransition>
    );
  }),
});
