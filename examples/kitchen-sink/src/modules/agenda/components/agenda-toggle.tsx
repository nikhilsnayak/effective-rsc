'use client';

import { Check, Plus, X } from 'lucide-react';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { toggleAgenda, type AgendaMutationState } from '@/modules/agenda/server-functions';

type AgendaToggleProps = {
  readonly isInAgenda: boolean;
  readonly sessionId: string;
};

export function AgendaToggle({ isInAgenda, sessionId }: AgendaToggleProps) {
  const action = toggleAgenda.bind(null, { sessionId });
  const [state, formAction, pending] = useActionState<AgendaMutationState | null>(action, null);
  const selected = state?.selected ?? isInAgenda;

  return (
    <form action={formAction} className='mt-5 flex flex-wrap items-center gap-3'>
      <Button
        aria-label={selected ? 'Remove from the agenda' : 'Add to the agenda'}
        disabled={pending}
        size='sm'
        type='submit'
        variant={selected ? 'secondary' : 'outline'}
      >
        {pending ? (
          'Saving…'
        ) : selected ? (
          <>
            <X aria-hidden='true' />
            Remove from agenda
          </>
        ) : (
          <>
            <Plus aria-hidden='true' />
            Add to agenda
          </>
        )}
      </Button>
      {state ? (
        <span
          aria-live='polite'
          className={
            state.status === 'error' ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
          }
        >
          {state.status === 'success' ? (
            <Check aria-hidden='true' className='mr-1 inline size-3' />
          ) : null}
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
