'use client';

import { startTransition, useActionState } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { updateTicketHolder } from '@/modules/attendee/server-functions';

export function TicketHolderForm({
  holderName,
  ticketId,
}: {
  readonly holderName: string;
  readonly ticketId: string;
}) {
  const [state, submit, pending] = useActionState(updateTicketHolder, null);

  return (
    <form
      className='mt-5 grid gap-3'
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => submit(formData));
      }}
    >
      <input name='ticketId' type='hidden' value={ticketId} />
      <Field>
        <FieldLabel htmlFor='ticket-holder-name'>Ticket holder</FieldLabel>
        <Input
          defaultValue={holderName}
          id='ticket-holder-name'
          maxLength={100}
          name='holderName'
          required
        />
      </Field>
      <div className='flex flex-wrap items-center gap-3'>
        <Button disabled={pending} size='sm' type='submit' variant='outline'>
          {pending ? 'Saving…' : 'Update holder'}
        </Button>
        {state ? (
          <RevealTransition>
            <span
              aria-live='polite'
              className={
                state.status === 'error'
                  ? 'text-destructive text-xs'
                  : 'text-muted-foreground text-xs'
              }
            >
              {state.message}
            </span>
          </RevealTransition>
        ) : null}
      </div>
    </form>
  );
}
