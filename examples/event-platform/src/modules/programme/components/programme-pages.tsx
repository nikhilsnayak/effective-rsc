import { DateTime, Effect, Schema } from 'effect';
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  MapPin,
  Mic2,
  Presentation,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Suspense, ViewTransition } from 'react';

import { NavigationTransition, RevealTransition } from '@/components/navigation-transition';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ERSC } from '@/ersc';
import { cn } from '@/lib/utils';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import { RoomForm, SessionForm, SpeakerForm } from '@/modules/programme/components/programme-forms';
import type { ProgrammeEvent, ProgrammeSessionStatus } from '@/modules/programme/model';
import { ProgrammeAccessDenied, PublicProgrammeNotFound } from '@/modules/programme/model';
import { ProgrammeService } from '@/modules/programme/service';

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

const publicTime = (value: string, timezone: string) =>
  DateTime.format(DateTime.makeZonedUnsafe(value, { timeZone: timezone }), {
    dateStyle: 'medium',
    locale: 'en',
    timeStyle: 'short',
  });

const statusVariant = (status: ProgrammeSessionStatus) => {
  switch (status) {
    case 'draft':
      return 'outline' as const;
    case 'published':
      return 'default' as const;
    case 'cancelled':
      return 'destructive' as const;
  }
};

function AccessDenied() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <ShieldCheck aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>
          Programme access required
        </h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          Your demo organizer role cannot edit this event programme.
        </p>
      </main>
    </NavigationTransition>
  );
}

const ProgrammeReadiness = OrganizerERSC.Component.make({
  render: Effect.fn('ProgrammeReadiness')(function* ({ eventId }: { readonly eventId: string }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* ProgrammeService;
    const readiness = yield* service.readiness(userId, eventId);

    return (
      <ViewTransition default='none' update='auto'>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>Publication readiness</CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground grid grid-cols-3 gap-4 text-sm'>
            <div>
              <strong className='text-foreground block text-xl'>{readiness.totalSessions}</strong>
              sessions
            </div>
            <div>
              <strong className='text-foreground block text-xl'>
                {readiness.publishedSessions}
              </strong>
              published
            </div>
            <div>
              <strong className='text-foreground block text-xl'>{readiness.draftSessions}</strong>
              drafts
            </div>
            {!readiness.canPublish ? (
              <p className='col-span-3'>Add a room and a speaker before scheduling sessions.</p>
            ) : null}
          </CardContent>
        </Card>
      </ViewTransition>
    );
  }),
});

export const ProgrammeEditorPage = OrganizerERSC.Page.make({
  params: Schema.Struct({ eventId: Schema.String }),
  render: Effect.fn('ProgrammeEditorPage')(function* ({ params }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* ProgrammeService;
    const editor = yield* service
      .editor(userId, params.eventId)
      .pipe(Effect.catchIf(Schema.is(ProgrammeAccessDenied), () => Effect.succeed(null)));
    if (editor === null) {
      return <AccessDenied />;
    }
    const sessions = editor.sessions.map((session) => ({
      ...session,
      endsAt: localDateTime(session.endsAt, editor.event.timezone),
      startsAt: localDateTime(session.startsAt, editor.event.timezone),
    }));

    return (
      <NavigationTransition key={`programme-editor-${editor.event.eventId}`}>
        <main className='mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14'>
          <a
            className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
            href='/organizer'
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            Organizer studio
          </a>
          <header className='mt-6 grid gap-6 border-b pb-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end'>
            <div>
              <div className='flex flex-wrap gap-2'>
                <Badge variant='outline'>{editor.event.organizationName}</Badge>
                <Badge variant='secondary'>{editor.event.status}</Badge>
              </div>
              <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
                {editor.event.eventName} programme
              </h1>
              <p className='text-muted-foreground mt-3 max-w-2xl leading-7'>
                Build rooms and speaker profiles, schedule conflict-free sessions, then publish them
                to the public agenda.
              </p>
              <div className='mt-5 flex flex-wrap gap-3'>
                <a
                  className={cn(buttonVariants({ variant: 'outline' }))}
                  href={`/organizer/events/${editor.event.eventId}/edit`}
                >
                  Edit event details
                </a>
                {editor.event.status === 'published' || editor.event.status === 'completed' ? (
                  <a
                    className={cn(buttonVariants({ variant: 'outline' }))}
                    href={`/events/${editor.event.organizationSlug}/${editor.event.eventSlug}/programme`}
                  >
                    Public programme
                    <ExternalLink aria-hidden='true' data-icon='inline-end' />
                  </a>
                ) : null}
              </div>
            </div>
            <Suspense
              fallback={
                <RevealTransition>
                  <Skeleton className='h-32 w-full rounded-xl' />
                </RevealTransition>
              }
            >
              <RevealTransition>
                <ProgrammeReadiness eventId={editor.event.eventId} />
              </RevealTransition>
            </Suspense>
          </header>

          <section className='border-b py-9' aria-labelledby='rooms-heading'>
            <div className='mb-6'>
              <p className='text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase'>
                <MapPin aria-hidden='true' className='size-3.5' />
                Venue setup
              </p>
              <h2 className='mt-2 text-2xl font-semibold' id='rooms-heading'>
                Rooms
              </h2>
            </div>
            <div className='grid gap-4 md:grid-cols-2'>
              {editor.rooms.map((room) => (
                <ViewTransition
                  default='none'
                  enter='reveal-in'
                  exit='reveal-out'
                  key={room.roomId}
                  update='auto'
                >
                  <RoomForm eventId={editor.event.eventId} room={room} />
                </ViewTransition>
              ))}
              <RoomForm eventId={editor.event.eventId} />
            </div>
          </section>

          <section className='border-b py-9' aria-labelledby='speakers-heading'>
            <div className='mb-6'>
              <p className='text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase'>
                <Mic2 aria-hidden='true' className='size-3.5' />
                People
              </p>
              <h2 className='mt-2 text-2xl font-semibold' id='speakers-heading'>
                Speakers
              </h2>
            </div>
            <div className='grid gap-4 md:grid-cols-2'>
              {editor.speakers.map((speaker) => (
                <ViewTransition
                  default='none'
                  enter='reveal-in'
                  exit='reveal-out'
                  key={speaker.speakerId}
                  update='auto'
                >
                  <SpeakerForm eventId={editor.event.eventId} speaker={speaker} />
                </ViewTransition>
              ))}
              <SpeakerForm eventId={editor.event.eventId} />
            </div>
          </section>

          <section className='py-9' aria-labelledby='sessions-heading'>
            <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
              <div>
                <p className='text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase'>
                  <CalendarClock aria-hidden='true' className='size-3.5' />
                  Schedule · {editor.event.timezone}
                </p>
                <h2 className='mt-2 text-2xl font-semibold' id='sessions-heading'>
                  Sessions
                </h2>
              </div>
              <span className='text-muted-foreground text-sm'>
                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
              </span>
            </div>
            <div className='grid gap-4'>
              {sessions.map((session) => (
                <ViewTransition
                  default='none'
                  enter='reveal-in'
                  exit='reveal-out'
                  key={session.sessionId}
                  update='auto'
                >
                  <div className='grid gap-2'>
                    <div className='flex justify-end'>
                      <Badge variant={statusVariant(session.status)}>{session.status}</Badge>
                    </div>
                    <SessionForm
                      event={editor.event}
                      rooms={editor.rooms}
                      session={session}
                      speakers={editor.speakers}
                    />
                  </div>
                </ViewTransition>
              ))}
              <SessionForm event={editor.event} rooms={editor.rooms} speakers={editor.speakers} />
            </div>
          </section>
        </main>
      </NavigationTransition>
    );
  }),
});

function PublicProgrammeMissing() {
  return (
    <NavigationTransition>
      <main className='mx-auto max-w-3xl px-5 py-20 text-center sm:px-8'>
        <Presentation aria-hidden='true' className='text-muted-foreground mx-auto size-8' />
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em]'>Programme unavailable</h1>
        <p className='text-muted-foreground mt-3 leading-7'>
          This event is private, unpublished, or no longer available at this address.
        </p>
        <a className={cn(buttonVariants({ variant: 'outline' }), 'mt-7')} href='/'>
          Browse events
        </a>
      </main>
    </NavigationTransition>
  );
}

function ProgrammeDate({ event }: { readonly event: ProgrammeEvent }) {
  return (
    <p className='text-muted-foreground mt-3 inline-flex items-center gap-2 text-sm'>
      <CalendarClock aria-hidden='true' className='size-4' />
      {publicTime(event.startsAt, event.timezone)} · {event.timezone}
    </p>
  );
}

export const PublicProgrammePage = ERSC.Page.make({
  params: Schema.Struct({ eventSlug: Schema.String, organizationSlug: Schema.String }),
  render: Effect.fn('PublicProgrammePage')(function* ({ params }) {
    const service = yield* ProgrammeService;
    const programme = yield* service
      .publicProgramme(params.organizationSlug, params.eventSlug)
      .pipe(Effect.catchIf(Schema.is(PublicProgrammeNotFound), () => Effect.succeed(null)));
    if (programme === null) {
      return <PublicProgrammeMissing />;
    }

    return (
      <NavigationTransition key={`public-programme-${programme.event.eventId}`}>
        <main className='mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:py-16'>
          <a
            className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
            href={`/events/${programme.event.organizationSlug}/${programme.event.eventSlug}`}
          >
            <ArrowLeft aria-hidden='true' className='size-4' />
            Event overview
          </a>
          <header className='mt-6 border-b pb-8'>
            <Badge variant='outline'>{programme.event.organizationName}</Badge>
            <h1 className='mt-4 text-4xl font-semibold tracking-[-0.03em]'>
              {programme.event.eventName} programme
            </h1>
            <ProgrammeDate event={programme.event} />
          </header>

          {programme.sessions.length === 0 ? (
            <Empty className='border-border mt-9 border'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <CalendarClock aria-hidden='true' />
                </EmptyMedia>
                <EmptyTitle>Programme coming soon</EmptyTitle>
                <EmptyDescription>
                  The organizer has not published any sessions yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ol className='grid gap-4 py-9'>
              {programme.sessions.map((session) => (
                <ViewTransition default='none' key={session.sessionId} update='auto'>
                  <li>
                    <Card>
                      <CardHeader>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                          <Badge variant='secondary'>{session.roomName}</Badge>
                          <span className='text-muted-foreground text-sm'>
                            {publicTime(session.startsAt, programme.event.timezone)} –{' '}
                            {DateTime.format(
                              DateTime.makeZonedUnsafe(session.endsAt, {
                                timeZone: programme.event.timezone,
                              }),
                              { locale: 'en', timeStyle: 'short' },
                            )}
                          </span>
                        </div>
                        <CardTitle className='mt-3 text-xl'>{session.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className='text-muted-foreground leading-7'>{session.summary}</p>
                        <div className='mt-5 flex flex-wrap items-center gap-5 text-sm'>
                          <span className='inline-flex items-center gap-2 font-medium'>
                            <Mic2 aria-hidden='true' className='size-4' />
                            {session.speakerName}
                          </span>
                          <span className='text-muted-foreground inline-flex items-center gap-2'>
                            <Users aria-hidden='true' className='size-4' />
                            {session.capacity} seats
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                </ViewTransition>
              ))}
            </ol>
          )}
        </main>
      </NavigationTransition>
    );
  }),
});
