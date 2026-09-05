'use client';

import { Send } from 'lucide-react';
import { useActionState } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import { notifyWaitlistEntry } from '@/modules/waitlist/server-functions';

export function NotifyWaitlistAction({
  entryId,
  eventId,
}: {
  readonly entryId: string;
  readonly eventId: string;
}) {
  const [state, formAction, pending] = useActionState(notifyWaitlistEntry, null);

  return (
    <form action={formAction} className='grid justify-items-end gap-2'>
      <input name='entryId' type='hidden' value={entryId} />
      <input name='eventId' type='hidden' value={eventId} />
      <Button disabled={pending} size='sm' type='submit' variant='outline'>
        <Send aria-hidden='true' data-icon='inline-start' />
        {pending ? 'Sending…' : 'Send update'}
      </Button>
      {state ? (
        <RevealTransition>
          <p
            aria-live='polite'
            className={state.status === 'error' ? 'text-destructive text-xs' : 'text-xs'}
          >
            {state.message}
          </p>
        </RevealTransition>
      ) : null}
    </form>
  );
}
