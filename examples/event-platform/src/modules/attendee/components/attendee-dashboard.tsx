import { DateTime, Effect, Schema } from 'effect';
import { ArrowRight, CalendarDays, Mail, MapPin, ShieldCheck, Ticket } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { AttendeeHubERSC, CurrentAttendeeSession } from '@/modules/attendee/current-attendee';
import { AttendeeAccessDenied } from '@/modules/attendee/model';
import { AttendeeService } from '@/modules/attendee/service';

const eventDate = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), {
    day: 'numeric',
    locale: 'en',
    month: 'short',
    year: 'numeric',
  });

function AccessDenied() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>Attendee access required</h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          This local magic-link session is missing or expired.
        </p>
      </main>
    </NavigationTransition>
  );
}

export const AttendeeDashboardPage = AttendeeHubERSC.Page.make({
  render: Effect.fn('AttendeeDashboardPage')(function* () {
    const { token } = yield* CurrentAttendeeSession;
    const service = yield* AttendeeService;
    const dashboard = yield* service
      .dashboard(token)
      .pipe(
        Effect.catch((error) =>
          Schema.is(AttendeeAccessDenied)(error) ? Effect.succeed(null) : Effect.fail(error),
        ),
      );

    if (dashboard === null) {
      return <AccessDenied />;
    }

    return (
      <NavigationTransition>
        <main className='mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16'>
          <header className='border-b pb-9'>
            <Badge variant='outline'>Local magic-link session</Badge>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>Your attendee hub</h1>
            <p className='text-muted-foreground mt-3 leading-7'>
              Tickets, orders, and locally delivered messages for {dashboard.email}.
            </p>
          </header>

          <div className='grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14'>
            <section aria-labelledby='attendee-tickets'>
              <div className='flex items-center justify-between gap-4'>
                <h2 id='attendee-tickets' className='text-2xl font-semibold tracking-[-0.02em]'>
                  Tickets
                </h2>
                <span className='text-muted-foreground text-sm'>{dashboard.tickets.length}</span>
              </div>
              {dashboard.tickets.length === 0 ? (
                <Empty className='border-border mt-5 border'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <Ticket aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>No tickets yet</EmptyTitle>
                    <EmptyDescription>Your issued event tickets will appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='mt-5 grid gap-4'>
                  {dashboard.tickets.map((ticket) => (
                    <ViewTransition
                      default='none'
                      enter='reveal-in'
                      exit='reveal-out'
                      key={ticket.ticketId}
                      update='auto'
                    >
                      <Card>
                        <CardHeader>
                          <div className='flex flex-wrap items-center justify-between gap-3'>
                            <Badge variant={ticket.status === 'valid' ? 'default' : 'secondary'}>
                              {ticket.status.replace('_', ' ')}
                            </Badge>
                            <span className='text-muted-foreground font-mono text-xs'>
                              {ticket.code}
                            </span>
                          </div>
                          <CardTitle className='mt-3 text-xl'>{ticket.eventName}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className='text-muted-foreground grid gap-2 text-sm sm:grid-cols-2'>
                            <span className='inline-flex items-center gap-2'>
                              <CalendarDays aria-hidden='true' className='size-4' />
                              {eventDate(ticket.startsAt)}
                            </span>
                            <span className='inline-flex items-center gap-2'>
                              <MapPin aria-hidden='true' className='size-4' />
                              {ticket.locality}
                            </span>
                          </div>
                          <a
                            className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}
                            href={`/attendee/${ticket.code}`}
                          >
                            Open ticket
                            <ArrowRight aria-hidden='true' data-icon='inline-end' />
                          </a>
                        </CardContent>
                      </Card>
                    </ViewTransition>
                  ))}
                </div>
              )}
            </section>

            <aside
              aria-labelledby='local-mailbox'
              className='border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8'
            >
              <h2 id='local-mailbox' className='inline-flex items-center gap-2 font-semibold'>
                <Mail aria-hidden='true' className='size-4' />
                Local mailbox
              </h2>
              <p className='text-muted-foreground mt-2 text-sm leading-6'>
                Transactional messages delivered by the deterministic email adapter.
              </p>
              {dashboard.messages.length === 0 ? (
                <Empty className='border-border mt-5 border px-3'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <Mail aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>No messages</EmptyTitle>
                    <EmptyDescription>Transactional messages will appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className='mt-5 grid gap-3'>
                  {dashboard.messages.map((message) => (
                    <article className='bg-muted rounded-lg p-4' key={message.emailId}>
                      <p className='text-sm font-medium'>{message.subject}</p>
                      <p className='text-muted-foreground mt-2 text-xs leading-5'>{message.body}</p>
                    </article>
                  ))}
                </div>
              )}
              <p className='text-muted-foreground mt-5 flex items-start gap-2 text-xs leading-5'>
                <Ticket aria-hidden='true' className='mt-0.5 size-3.5 shrink-0' />
                Default session token: demo-attendee-ada
              </p>
            </aside>
          </div>
        </main>
      </NavigationTransition>
    );
  }),
});
