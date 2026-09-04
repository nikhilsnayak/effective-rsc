import { DateTime, Effect, Schema } from 'effect';
import { ArrowLeft, ListClock, ShieldCheck } from 'lucide-react';
import { ViewTransition } from 'react';

import { NavigationTransition } from '@/components/navigation-transition';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import { NotifyWaitlistAction } from '@/modules/waitlist/components/notify-waitlist-action';
import { WaitlistAccessDenied } from '@/modules/waitlist/model';
import { WaitlistService } from '@/modules/waitlist/service';

const joinedDate = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), {
    dateStyle: 'medium',
    locale: 'en',
    timeStyle: 'short',
  });

export const WaitlistPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('WaitlistPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* WaitlistService;
    const workspace = yield* service
      .workspace(userId, params.eventId)
      .pipe(Effect.catchIf(Schema.is(WaitlistAccessDenied), () => Effect.succeed(null)));
    if (workspace === null) {
      return (
        <NavigationTransition>
          <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
            <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
            <h1 className='mt-4 text-3xl font-semibold'>Waitlist access required</h1>
            <p className='text-muted-foreground mt-3'>
              Your organizer role cannot manage waitlists.
            </p>
          </main>
        </NavigationTransition>
      );
    }

    return (
      <NavigationTransition key={`waitlist-${workspace.event.eventId}`}>
        <main className='mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14'>
          <a
            className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
            href='/organizer'
          >
            <ArrowLeft aria-hidden='true' className='size-4' /> Organizer studio
          </a>
          <header className='mt-6 border-b pb-8'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline'>{workspace.event.organizationName}</Badge>
              <Badge variant='secondary'>{workspace.event.status}</Badge>
            </div>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
              {workspace.event.eventName} waitlist
            </h1>
            <p className='text-muted-foreground mt-3'>
              Review requests in arrival order and send explicit status updates.
            </p>
          </header>
          <section className='py-8' aria-labelledby='waitlist-heading'>
            <div className='flex items-center justify-between gap-4'>
              <h2 className='text-2xl font-semibold' id='waitlist-heading'>
                Attendees
              </h2>
              <span className='text-muted-foreground text-sm'>{workspace.entries.length}</span>
            </div>
            {workspace.entries.length === 0 ? (
              <Empty className='border-border mt-5 border'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <ListClock aria-hidden='true' />
                  </EmptyMedia>
                  <EmptyTitle>No waitlist requests</EmptyTitle>
                  <EmptyDescription>Sold-out ticket requests appear here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className='mt-5 grid gap-4'>
                {workspace.entries.map((entry, index) => (
                  <ViewTransition
                    default='none'
                    enter='reveal-in'
                    exit='reveal-out'
                    key={entry.entryId}
                    update='auto'
                  >
                    <Card>
                      <CardHeader>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                          <Badge variant={entry.status === 'waiting' ? 'default' : 'secondary'}>
                            {entry.status}
                          </Badge>
                          <span className='text-muted-foreground text-xs'>#{index + 1}</span>
                        </div>
                        <CardTitle className='mt-3'>{entry.attendeeName}</CardTitle>
                      </CardHeader>
                      <CardContent className='grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'>
                        <div className='text-muted-foreground grid gap-1 text-sm'>
                          <span>{entry.attendeeEmail}</span>
                          <span>{entry.ticketTypeName}</span>
                          <span>Joined {joinedDate(entry.createdAt)}</span>
                        </div>
                        {entry.status === 'waiting' ? (
                          <NotifyWaitlistAction
                            entryId={entry.entryId}
                            eventId={workspace.event.eventId}
                          />
                        ) : null}
                      </CardContent>
                    </Card>
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
