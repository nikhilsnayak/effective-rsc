'use client';

import { Check, Plus, X } from 'lucide-react';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import type { SelectionMutationState } from '@/modules/selection/server-functions';

type SelectionToggleProps = {
  readonly action: () => Promise<SelectionMutationState>;
  readonly isSelected: boolean;
};

export function SelectionToggle({ action, isSelected }: SelectionToggleProps) {
  const [state, formAction, pending] = useActionState<SelectionMutationState | null>(action, null);
  const selected = state?.selected ?? isSelected;

  return (
    <form action={formAction} className='mt-5 flex flex-wrap items-center gap-3'>
      <Button
        aria-label={selected ? 'Remove from the selection' : 'Add to the selection'}
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
            Remove from selection
          </>
        ) : (
          <>
            <Plus aria-hidden='true' />
            Add to selection
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
