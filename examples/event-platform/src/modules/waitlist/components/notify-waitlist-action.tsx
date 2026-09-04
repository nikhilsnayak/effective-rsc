'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.

import { Send } from 'lucide-react';
import { useState, useTransition } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import type { WaitlistMutationState } from '@/modules/waitlist/server-functions';
import { notifyWaitlistEntry } from '@/modules/waitlist/server-functions';

export function NotifyWaitlistAction({
  entryId,
  eventId,
}: {
  readonly entryId: string;
  readonly eventId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<WaitlistMutationState | null>(null);

  return (
    <form
      className='grid justify-items-end gap-2'
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await notifyWaitlistEntry(formData);
          startTransition(() => setState(result));
        });
      }}
    >
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
