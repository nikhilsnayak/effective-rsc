import { Effect } from 'effect';
import { ArrowRight, CalendarDays, MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ERSC } from '@/ersc';
import { cn } from '@/lib/utils';
import {
  ConferenceRepository,
  type ConferenceDay,
  type ObservedQuery,
  type Schedule,
} from '@/modules/conference/conference-repository';
import { SessionCard } from '@/modules/schedule/components/session-card';

type ScheduleViewProps = {
  readonly day: ConferenceDay;
  readonly schedule: ObservedQuery<Schedule>;
};

const ScheduleView = ({ day, schedule }: ScheduleViewProps) => {
  const nextDay = day === 'saturday';

  return (
    <main
      className='min-w-0 py-8 lg:py-10'
      data-schedule-completed-at={schedule.completedAt}
      data-schedule-started-at={schedule.startedAt}
    >
      <header className='border-b pb-7'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>Day {day === 'saturday' ? '01' : '02'}</Badge>
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
          href={nextDay ? '/schedule/day-two' : '/'}
        >
          {nextDay ? 'See Sunday' : 'Back to Saturday'}
          <ArrowRight aria-hidden='true' />
        </a>
      </footer>
    </main>
  );
};

export const SaturdaySchedulePage = ERSC.Page.make({
  render: Effect.fn('SaturdaySchedulePage')(function* () {
    const repository = yield* ConferenceRepository;
    const schedule = yield* repository.schedule('saturday');

    return <ScheduleView day='saturday' schedule={schedule} />;
  }),
});

export const SundaySchedulePage = ERSC.Page.make({
  render: Effect.fn('SundaySchedulePage')(function* () {
    const repository = yield* ConferenceRepository;
    const schedule = yield* repository.schedule('sunday');

    return <ScheduleView day='sunday' schedule={schedule} />;
  }),
});
