'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.
// oxlint-disable effecttsgo/crypto-random-uuid -- Browser-generated idempotency keys must not pull Effect into the client graph.

import { BellRing } from 'lucide-react';
import { startTransition, useActionState, useState } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { TicketType } from '@/modules/registration/model';
import type { WaitlistMutationState } from '@/modules/waitlist/server-functions';
import { joinWaitlist } from '@/modules/waitlist/server-functions';

export function WaitlistForm({
  eventId,
  tickets,
}: {
  readonly eventId: string;
  readonly tickets: ReadonlyArray<TicketType>;
}) {
  // oxlint-disable-next-line effecttsgo/crypto-random-uuid -- The browser owns this join-attempt key before invoking the Server Function.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [state, submit, pending] = useActionState<WaitlistMutationState | null, FormData>(
    async (previousState, form) => {
      const result = await joinWaitlist(previousState, form);
      if (result.status === 'error') {
        setIdempotencyKey(crypto.randomUUID());
      }
      return result;
    },
    null,
  );

  if (tickets.length === 0) {
    return null;
  }

  return (
    <section className='border-border mt-8 rounded-xl border p-6' aria-labelledby='waitlist-title'>
      <BellRing aria-hidden='true' className='text-primary size-6' />
      <h2 className='mt-3 text-xl font-semibold' id='waitlist-title'>
        Join a waitlist
      </h2>
      <p className='text-muted-foreground mt-2 text-sm leading-6'>
        We’ll add you once and organizers can send an update when you are next. Updates do not
        reserve a place, and no payment details are collected.
      </p>
      <form
        className='mt-6 grid gap-5'
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => submit(formData));
        }}
      >
        <input name='eventId' type='hidden' value={eventId} />
        <input name='idempotencyKey' type='hidden' value={idempotencyKey} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='waitlist-ticket'>Ticket</FieldLabel>
            <NativeSelect className='w-full' id='waitlist-ticket' name='ticketTypeId' required>
              {tickets.map((ticket) => (
                <NativeSelectOption key={ticket.ticketTypeId} value={ticket.ticketTypeId}>
                  {ticket.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor='waitlist-name'>Waitlist name</FieldLabel>
            <Input id='waitlist-name' maxLength={100} name='attendeeName' required />
          </Field>
          <Field>
            <FieldLabel htmlFor='waitlist-email'>Waitlist email</FieldLabel>
            <Input id='waitlist-email' maxLength={254} name='attendeeEmail' required type='email' />
            <FieldDescription>
              Repeated joins with this email return the same entry.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {state ? (
          <RevealTransition>
            <p
              aria-live='polite'
              className={state.status === 'error' ? 'text-destructive text-sm' : 'text-sm'}
            >
              {state.message}
            </p>
          </RevealTransition>
        ) : null}
        <Button disabled={pending} type='submit' variant='outline'>
          {pending ? 'Joining…' : 'Join waitlist'}
        </Button>
      </form>
    </section>
  );
}
