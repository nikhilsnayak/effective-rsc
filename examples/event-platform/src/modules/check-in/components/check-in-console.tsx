import { DateTime, Effect, Schema } from 'effect';
import { Activity, ArrowLeft, ScanLine, ShieldCheck, TicketCheck, Users } from 'lucide-react';
import { ViewTransition } from 'react';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { CheckInScanner } from '@/modules/check-in/components/check-in-scanner';
import { CheckInAccessDenied } from '@/modules/check-in/model';
import { CheckInService } from '@/modules/check-in/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

const activityTime = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), {
    hour: '2-digit',
    locale: 'en',
    minute: '2-digit',
  });

function AccessDenied() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>Check-in access required</h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          Your demo staff identity cannot operate this event.
        </p>
      </main>
    </NavigationTransition>
  );
}

export const CheckInConsolePage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('CheckInConsolePage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* CheckInService;
    const checkIn = yield* service
      .console(userId, params.eventId)
      .pipe(
        Effect.catch((error) =>
          Schema.is(CheckInAccessDenied)(error) ? Effect.succeed(null) : Effect.fail(error),
        ),
      );

    if (checkIn === null) {
      return <AccessDenied />;
    }

    const remaining = checkIn.event.issued - checkIn.event.checkedIn;

    return (
      <NavigationTransition key={`check-in-${checkIn.event.eventId}`}>
        <main className='mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14'>
          <a
            className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm'
            href='/organizer'
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            Organizer studio
          </a>
          <header className='mt-6 flex flex-col justify-between gap-6 border-b pb-8 md:flex-row md:items-end'>
            <div>
              <Badge variant='outline'>{checkIn.event.organizationName}</Badge>
              <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
                {checkIn.event.eventName} check-in
              </h1>
              <p className='text-muted-foreground mt-3 flex items-center gap-2 text-sm'>
                <ShieldCheck aria-hidden='true' className='size-4' />
                Authorized as {checkIn.event.role.replace('_', ' ')}
              </p>
            </div>
            <ViewTransition default='none' update='auto'>
              <div className='grid grid-cols-3 gap-3 text-center'>
                <div className='bg-muted rounded-lg px-4 py-3'>
                  <p className='text-2xl font-semibold tabular-nums'>{checkIn.event.issued}</p>
                  <p className='text-muted-foreground mt-1 text-xs'>Issued</p>
                </div>
                <div className='bg-muted rounded-lg px-4 py-3'>
                  <p className='text-2xl font-semibold tabular-nums'>{checkIn.event.checkedIn}</p>
                  <p className='text-muted-foreground mt-1 text-xs'>Arrived</p>
                </div>
                <div className='bg-muted rounded-lg px-4 py-3'>
                  <p className='text-2xl font-semibold tabular-nums'>{remaining}</p>
                  <p className='text-muted-foreground mt-1 text-xs'>Remaining</p>
                </div>
              </div>
            </ViewTransition>
          </header>

          <div className='grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14'>
            <CheckInScanner eventId={checkIn.event.eventId} />

            <aside
              className='border-t pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8'
              aria-labelledby='check-in-activity'
            >
              <h2 id='check-in-activity' className='inline-flex items-center gap-2 font-semibold'>
                <Activity aria-hidden='true' className='size-4' />
                Recent activity
              </h2>
              {checkIn.audit.length === 0 ? (
                <Empty className='border-border mt-5 border'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <ScanLine aria-hidden='true' />
                    </EmptyMedia>
                    <EmptyTitle>No check-in activity</EmptyTitle>
                    <EmptyDescription>Scans and reversals will appear here.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ol className='mt-5 grid gap-3'>
                  {checkIn.audit.map((entry) => (
                    <ViewTransition
                      default='none'
                      enter='reveal-in'
                      exit='reveal-out'
                      key={`${entry.recordedAt}-${entry.ticketCode}-${entry.action}`}
                      update='auto'
                    >
                      <li className='bg-muted rounded-lg p-4'>
                        <p className='flex items-center gap-2 text-sm font-medium'>
                          {entry.action === 'check_in' ? (
                            <TicketCheck aria-hidden='true' className='size-4' />
                          ) : (
                            <Users aria-hidden='true' className='size-4' />
                          )}
                          {entry.holderName}
                        </p>
                        <p className='text-muted-foreground mt-2 text-xs'>
                          {entry.action === 'check_in' ? 'Checked in' : 'Reopened'} by{' '}
                          {entry.staffName}
                        </p>
                        <p className='text-muted-foreground mt-1 font-mono text-xs'>
                          {entry.ticketCode} · {activityTime(entry.recordedAt)} UTC
                        </p>
                      </li>
                    </ViewTransition>
                  ))}
                </ol>
              )}
            </aside>
          </div>
        </main>
      </NavigationTransition>
    );
  }),
});
