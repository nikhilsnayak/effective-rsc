import { DateTime, Effect, Schema } from 'effect';
import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  ListTree,
  ListClock,
  Megaphone,
  Pencil,
  Plus,
  ReceiptText,
  ScanLine,
  ShieldCheck,
} from 'lucide-react';
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
import { EventStatusAction } from '@/modules/organizer/components/event-status-action';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import type { ManagedEvent, ManagedEventStatus, OrganizationRole } from '@/modules/organizer/model';
import { OrganizerAccessDenied } from '@/modules/organizer/model';
import { transitionEventStatus } from '@/modules/organizer/server-functions';
import { availableEventTransitions, OrganizerService } from '@/modules/organizer/service';

const statusVariant = (status: ManagedEventStatus) => {
  switch (status) {
    case 'draft':
      return 'outline' as const;
    case 'published':
      return 'default' as const;
    case 'cancelled':
      return 'destructive' as const;
    case 'completed':
      return 'secondary' as const;
  }
};

const eventDate = (value: string) =>
  DateTime.formatUtc(DateTime.makeUnsafe(value), {
    day: 'numeric',
    locale: 'en',
    month: 'short',
    year: 'numeric',
  });

const transitionLabel = (status: ManagedEventStatus) => {
  switch (status) {
    case 'published':
      return 'Publish event';
    case 'cancelled':
      return 'Cancel event';
    case 'completed':
      return 'Mark completed';
    case 'draft':
      return 'Move to draft';
  }
};

function ManagedEventCard({
  event,
  role,
}: {
  readonly event: ManagedEvent;
  readonly role: OrganizationRole;
}) {
  const transitions = availableEventTransitions(event.status);
  const canManage = role === 'owner' || role === 'admin' || role === 'event_manager';
  const canCheckIn = role !== 'viewer' && event.status !== 'draft' && event.status !== 'cancelled';

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
            <CalendarDays aria-hidden='true' className='size-3.5' />
            {eventDate(event.startsAt)}
          </span>
        </div>
        <CardTitle className='mt-3 text-xl tracking-[-0.02em]'>{event.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground font-mono text-xs'>{event.eventSlug}</p>
        <div className='mt-5 flex flex-wrap gap-2'>
          {canManage ? (
            <>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={`/organizer/events/${event.eventId}/edit`}
              >
                <Pencil aria-hidden='true' data-icon='inline-start' />
                Edit event
              </a>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={`/organizer/events/${event.eventId}/programme`}
              >
                <ListTree aria-hidden='true' data-icon='inline-start' />
                Programme
              </a>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={`/organizer/events/${event.eventId}/reports`}
              >
                <ChartNoAxesCombined aria-hidden='true' data-icon='inline-start' />
                Reports
              </a>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={`/organizer/events/${event.eventId}/registration`}
              >
                <ClipboardList aria-hidden='true' data-icon='inline-start' />
                Registration
              </a>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={`/organizer/events/${event.eventId}/communications`}
              >
                <Megaphone aria-hidden='true' data-icon='inline-start' />
                Communications
              </a>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={`/organizer/events/${event.eventId}/orders`}
              >
                <ReceiptText aria-hidden='true' data-icon='inline-start' />
                Orders
              </a>
              <a
                className={cn(buttonVariants({ variant: 'outline' }))}
                href={`/organizer/events/${event.eventId}/waitlist`}
              >
                <ListClock aria-hidden='true' data-icon='inline-start' />
                Waitlist
              </a>
            </>
          ) : null}
          {canCheckIn ? (
            <a
              className={cn(buttonVariants({ variant: 'outline' }))}
              href={`/organizer/check-in/${event.eventId}`}
            >
              <ScanLine aria-hidden='true' data-icon='inline-start' />
              Open check-in
            </a>
          ) : null}
        </div>
        {transitions.length === 0 && canManage ? (
          <p className='text-muted-foreground mt-5 text-sm'>This lifecycle is final.</p>
        ) : canManage ? (
          <div className='mt-5 grid gap-3'>
            {transitions.map((targetStatus) => {
              const action = transitionEventStatus.bind(null, {
                eventId: event.eventId,
                targetStatus,
              });

              return (
                <EventStatusAction
                  action={action}
                  id={`event-status-${event.eventId}-${targetStatus}`}
                  key={targetStatus}
                  label={transitionLabel(targetStatus)}
                  variant={targetStatus === 'cancelled' ? 'destructive' : 'default'}
                />
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AccessDenied() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>
          Organizer access required
        </h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          The selected demo identity does not belong to an organization workspace.
        </p>
      </main>
    </NavigationTransition>
  );
}

export const OrganizerDashboardPage = OrganizerERSC.Page.make({
  render: Effect.fn('OrganizerDashboardPage')(function* () {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* OrganizerService;
    const dashboard = yield* service
      .dashboard(userId)
      .pipe(
        Effect.catch((error) =>
          Schema.is(OrganizerAccessDenied)(error) ? Effect.succeed(null) : Effect.fail(error),
        ),
      );

    if (dashboard === null) {
      return <AccessDenied />;
    }

    return (
      <NavigationTransition>
        <main className='mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:py-16'>
          <header className='flex flex-col justify-between gap-6 border-b pb-9 md:flex-row md:items-end'>
            <div>
              <Badge variant='outline'>Demo organizer workspace</Badge>
              <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>Organizer studio</h1>
              <p className='text-muted-foreground mt-3 max-w-2xl leading-7'>
                Manage event lifecycles across every organization available to {dashboard.user.name}
                .
              </p>
            </div>
            <div className='text-muted-foreground text-sm md:text-right'>
              <p className='text-foreground font-medium'>{dashboard.user.name}</p>
              <p>{dashboard.user.email}</p>
            </div>
          </header>

          <div className='grid gap-10 py-9'>
            {dashboard.organizations.map((organization) => (
              <section
                key={organization.organizationId}
                aria-labelledby={organization.organizationId}
              >
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <p className='text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase'>
                      <Building2 aria-hidden='true' className='size-3.5' />
                      Organization
                    </p>
                    <h2
                      className='mt-2 text-2xl font-semibold tracking-[-0.02em]'
                      id={organization.organizationId}
                    >
                      {organization.name}
                    </h2>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge variant='secondary'>{organization.role.replace('_', ' ')}</Badge>
                    {organization.role === 'owner' ||
                    organization.role === 'admin' ||
                    organization.role === 'event_manager' ? (
                      <a
                        className={cn(buttonVariants({ variant: 'outline' }))}
                        href={`/organizer/organizations/${organization.organizationId}/events/new`}
                      >
                        <Plus aria-hidden='true' data-icon='inline-start' />
                        Create event
                      </a>
                    ) : null}
                  </div>
                </div>
                {organization.events.length === 0 ? (
                  <Empty className='border-border mt-5 border'>
                    <EmptyHeader>
                      <EmptyMedia variant='icon'>
                        <CalendarDays aria-hidden='true' />
                      </EmptyMedia>
                      <EmptyTitle>No events yet</EmptyTitle>
                      <EmptyDescription>
                        Create a draft event for this organization.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className='mt-5 grid gap-4 md:grid-cols-2'>
                    {organization.events.map((event) => (
                      <ViewTransition
                        default='none'
                        enter='reveal-in'
                        exit='reveal-out'
                        key={event.eventId}
                        update='auto'
                      >
                        <ManagedEventCard event={event} role={organization.role} />
                      </ViewTransition>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </main>
      </NavigationTransition>
    );
  }),
});
