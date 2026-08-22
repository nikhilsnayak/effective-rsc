import { Clock3, MapPin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AgendaToggle } from '@/modules/agenda/components/agenda-toggle';
import type { Session } from '@/modules/conference/conference-repository';

export function SessionCard({ session }: { readonly session: Session }) {
  return (
    <Card className='gap-0 rounded-lg py-0 shadow-none'>
      <article className='grid sm:grid-cols-[7.5rem_minmax(0,1fr)]'>
        <div className='border-b px-5 py-5 sm:border-r sm:border-b-0'>
          <p className='font-mono text-sm font-semibold tabular-nums'>{session.startsAt}</p>
          <p className='text-muted-foreground mt-1 font-mono text-xs tabular-nums'>
            until {session.endsAt}
          </p>
        </div>
        <CardContent className='px-5 py-5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='secondary'>{session.track}</Badge>
            <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
              <MapPin aria-hidden='true' className='size-3.5' />
              {session.room}
            </span>
          </div>
          <h2 className='mt-3 text-lg font-semibold tracking-tight'>{session.title}</h2>
          <p className='text-muted-foreground mt-2 max-w-2xl text-sm leading-6'>
            {session.description}
          </p>
          <div className='mt-4 flex items-center gap-2 text-sm'>
            <span className='font-medium'>{session.speaker}</span>
            <span aria-hidden='true' className='text-border'>
              /
            </span>
            <span className='text-muted-foreground'>{session.speakerRole}</span>
          </div>
          <AgendaToggle isInAgenda={session.isInAgenda} sessionId={session.id} />
          <span className='sr-only'>
            <Clock3 aria-hidden='true' /> {session.startsAt} to {session.endsAt}
          </span>
        </CardContent>
      </article>
    </Card>
  );
}
