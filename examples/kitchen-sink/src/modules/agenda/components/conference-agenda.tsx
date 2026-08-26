import { CalendarCheck2, MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { AgendaItem, ObservedQuery } from '@/modules/conference/model';

type ConferenceAgendaProps = {
  readonly agenda: ObservedQuery<ReadonlyArray<AgendaItem>>;
};

export default function ConferenceAgenda({ agenda }: ConferenceAgendaProps) {
  return (
    <section
      aria-labelledby='conference-agenda-heading'
      data-agenda-completed-at={agenda.completedAt}
      data-agenda-started-at={agenda.startedAt}
    >
      <div className='flex items-center gap-2'>
        <CalendarCheck2 aria-hidden='true' className='size-4' />
        <h2 id='conference-agenda-heading' className='text-sm font-semibold'>
          Conference agenda
        </h2>
        <Badge className='ml-auto' variant='secondary'>
          {agenda.data.length}
        </Badge>
      </div>
      <ol className='mt-4 divide-y border-y'>
        {agenda.data.map((item) => (
          <li key={item.id} className='py-4 first:pt-3 last:pb-3'>
            <p className='text-muted-foreground font-mono text-xs tabular-nums'>
              {item.dayLabel} · {item.startsAt}
            </p>
            <p className='mt-1.5 text-sm leading-5 font-medium'>{item.title}</p>
            <p className='text-muted-foreground mt-2 flex items-center gap-1 text-xs'>
              <MapPin aria-hidden='true' className='size-3' />
              {item.room}
            </p>
          </li>
        ))}
      </ol>
      <p className='text-muted-foreground mt-4 text-xs leading-5'>
        Your selected sessions are ready across both conference days.
      </p>
    </section>
  );
}
