import { Effect, Schema } from 'effect';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AttendeeERSC, CurrentAttendee } from '@/modules/conference/attendee';
import type { ObservedQuery, Schedule } from '@/modules/conference/model';
import { ConferenceService } from '@/modules/conference/service';
import { SessionCard } from '@/modules/schedule/components/session-card';

type ScheduleViewProps = {
  readonly attendeeName: string | null;
  readonly schedule: ObservedQuery<Schedule>;
};

function ScheduleView({ attendeeName, schedule }: ScheduleViewProps) {
  const nextDay = schedule.data.day === 'saturday';

  return (
    <main
      className='min-w-0 py-8 lg:py-10'
      data-schedule-completed-at={schedule.completedAt}
      data-schedule-started-at={schedule.startedAt}
    >
      <header className='border-b pb-7'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>Day {schedule.data.day === 'saturday' ? '01' : '02'}</Badge>
          <span className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'>
            <CalendarDays aria-hidden='true' className='size-4' />
            {schedule.data.date}
          </span>
        </div>
        <h1 className='mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl'>
          {`${schedule.data.label} schedule`}
        </h1>
        <p className='text-muted-foreground mt-3 max-w-2xl leading-7 text-pretty'>
          Four focused sessions on the architecture, platform capabilities, and craft behind modern
          React applications.
        </p>
        <p className='text-muted-foreground mt-4 inline-flex items-center gap-1.5 text-sm'>
          <MapPin aria-hidden='true' className='size-4' />
          Bangalore International Centre
        </p>
        {attendeeName === null ? null : (
          <p className='text-muted-foreground mt-2 text-sm'>Personalized for {attendeeName}</p>
        )}
      </header>

      <section className='py-7' aria-label={`${schedule.data.label} sessions`}>
        <div className='space-y-3'>
          {schedule.data.sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      </section>

      <footer className='flex justify-end border-t pt-6'>
        <a
          aria-label={nextDay ? 'See Sunday' : 'Back to Saturday'}
          className={cn(buttonVariants({ variant: 'outline' }))}
          href={nextDay ? '/schedule/sunday' : '/schedule/saturday'}
        >
          {nextDay ? 'See Sunday' : 'Back to Saturday'}
          <ArrowRight aria-hidden='true' />
        </a>
      </footer>
    </main>
  );
}

export const SchedulePage = AttendeeERSC.Page.make({
  params: Schema.Struct({
    day: Schema.Literals(['saturday', 'sunday']),
  }),
  render: Effect.fn('SchedulePage')(function* ({ params }) {
    const attendee = yield* CurrentAttendee;
    const service = yield* ConferenceService;
    const schedule = yield* service.schedule(params.day);

    return <ScheduleView attendeeName={attendee.name} schedule={schedule} />;
  }),
});
