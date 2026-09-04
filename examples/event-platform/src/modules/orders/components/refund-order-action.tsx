'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.

import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useState, useTransition } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { OrderMutationState } from '@/modules/orders/server-functions';
import { refundOrder } from '@/modules/orders/server-functions';

export function RefundOrderAction({ eventId, orderId }: { eventId: string; orderId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<OrderMutationState | null>(null);

  return (
    <div className='grid gap-2'>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogTrigger
          id={`refund-${orderId}`}
          render={<Button size='sm' type='button' variant='destructive' />}
        >
          <RotateCcw aria-hidden='true' data-icon='inline-start' />
          Refund order
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlert aria-hidden='true' />
            </AlertDialogMedia>
            <AlertDialogTitle>Refund this order?</AlertDialogTitle>
            <AlertDialogDescription>
              The credential will be cancelled and its ticket inventory returned. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            className='grid gap-5'
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                const next = await refundOrder(formData);
                startTransition(() => {
                  setState(next);
                  if (next.status === 'success') {
                    setOpen(false);
                  }
                });
              });
            }}
          >
            <input name='eventId' type='hidden' value={eventId} />
            <input name='orderId' type='hidden' value={orderId} />
            <Field>
              <FieldLabel htmlFor={`refund-reason-${orderId}`}>Refund reason</FieldLabel>
              <Textarea
                className='min-h-24'
                id={`refund-reason-${orderId}`}
                maxLength={500}
                name='reason'
                required
              />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending} size='sm'>
                Keep order
              </AlertDialogCancel>
              <Button disabled={pending} size='sm' type='submit' variant='destructive'>
                {pending ? 'Refunding…' : 'Confirm refund'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      {state ? (
        <RevealTransition>
          <p
            aria-live='polite'
            className={
              state.status === 'error'
                ? 'text-destructive text-xs'
                : 'text-muted-foreground text-xs'
            }
          >
            {state.message}
          </p>
        </RevealTransition>
      ) : null}
    </div>
  );
}
