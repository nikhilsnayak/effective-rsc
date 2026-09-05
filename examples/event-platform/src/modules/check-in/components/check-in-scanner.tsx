'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.

import { RotateCcw, ScanLine, UserCheck } from 'lucide-react';
import { startTransition, useActionState, useRef } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { CheckInMutationState } from '@/modules/check-in/server-functions';
import { mutateCheckIn } from '@/modules/check-in/server-functions';

export function CheckInScanner({ eventId }: { readonly eventId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, submit, pending] = useActionState<CheckInMutationState | null, FormData>(
    async (previousState, form) => {
      const result = await mutateCheckIn(previousState, form);
      input.current?.select();
      return result;
    },
    null,
  );

  return (
    <section aria-labelledby='credential-scanner'>
      <div className='flex items-center gap-2'>
        <ScanLine aria-hidden='true' className='size-5' />
        <h2 id='credential-scanner' className='text-xl font-semibold'>
          Credential scanner
        </h2>
      </div>
      <p className='text-muted-foreground mt-2 text-sm leading-6'>
        Scan a QR code or enter its ticket code. The seeded credential is GTH-DEMOADA0001.
      </p>

      <form
        className='mt-5 flex flex-col gap-3 sm:flex-row'
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => submit(formData));
        }}
      >
        <input name='eventId' type='hidden' value={eventId} />
        <input name='operation' type='hidden' value='check_in' />
        <Field className='min-w-0 flex-1'>
          <FieldLabel className='sr-only' htmlFor='ticket-code'>
            Ticket code
          </FieldLabel>
          <Input
            autoComplete='off'
            className='font-mono uppercase'
            id='ticket-code'
            name='ticketCode'
            placeholder='GTH-…'
            ref={input}
            required
          />
        </Field>
        <Button disabled={pending} type='submit'>
          <UserCheck aria-hidden='true' data-icon='inline-start' />
          {pending ? 'Checking…' : 'Check in'}
        </Button>
      </form>

      {state ? (
        <RevealTransition>
          <div
            aria-live='polite'
            className={
              state.status === 'error'
                ? 'border-destructive/30 bg-destructive/5 mt-5 rounded-lg border p-4'
                : 'border-border bg-muted mt-5 rounded-lg border p-4'
            }
          >
            <p
              className={state.status === 'error' ? 'text-destructive font-medium' : 'font-medium'}
            >
              {state.message}
            </p>
            {state.status === 'success' ? (
              <div className='mt-3 flex flex-wrap items-end justify-between gap-4'>
                <dl className='grid gap-1 text-sm'>
                  <div className='flex gap-2'>
                    <dt className='text-muted-foreground'>Ticket</dt>
                    <dd>{state.ticket.ticketTypeName}</dd>
                  </div>
                  <div className='flex gap-2'>
                    <dt className='text-muted-foreground'>Code</dt>
                    <dd className='font-mono'>{state.ticket.code}</dd>
                  </div>
                </dl>
                {state.outcome === 'reopened' ? null : (
                  <Button
                    disabled={pending}
                    onClick={() => {
                      const formData = new FormData();
                      formData.set('eventId', eventId);
                      formData.set('operation', 'undo');
                      formData.set('ticketCode', state.ticket.code);
                      startTransition(() => submit(formData));
                    }}
                    size='sm'
                    type='button'
                    variant='outline'
                  >
                    <RotateCcw aria-hidden='true' data-icon='inline-start' />
                    Undo check-in
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </RevealTransition>
      ) : null}
    </section>
  );
}
