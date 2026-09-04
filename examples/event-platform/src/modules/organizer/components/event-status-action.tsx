'use client';

import { Check, TriangleAlert } from 'lucide-react';
import { startTransition, useActionState, useState } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import {
  AlertDialog,
  AlertDialogAction,
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
import type { EventStatusMutationState } from '@/modules/organizer/server-functions';

type EventStatusActionProps = {
  readonly action: () => Promise<EventStatusMutationState>;
  readonly id: string;
  readonly label: string;
  readonly variant: 'default' | 'destructive' | 'outline';
};

export function EventStatusAction({ action, id, label, variant }: EventStatusActionProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<EventStatusMutationState | null>(
    () =>
      action().then((next) => {
        if (next.status === 'success') {
          startTransition(() => setOpen(false));
        }
        return next;
      }),
    null,
  );

  const result = state ? (
    <RevealTransition>
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
    </RevealTransition>
  ) : null;

  if (variant === 'destructive') {
    return (
      <div className='flex flex-wrap items-center gap-2'>
        <AlertDialog onOpenChange={setOpen} open={open}>
          <AlertDialogTrigger
            id={id}
            render={<Button size='sm' type='button' variant='destructive' />}
          >
            {label}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <TriangleAlert aria-hidden='true' />
              </AlertDialogMedia>
              <AlertDialogTitle>Cancel this event?</AlertDialogTitle>
              <AlertDialogDescription>
                Cancellation is final. Registration and check-in will no longer be available.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={formAction}>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending} size='sm'>
                  Keep event
                </AlertDialogCancel>
                <AlertDialogAction disabled={pending} size='sm' type='submit' variant='destructive'>
                  {pending ? 'Cancelling…' : 'Cancel event'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
        {result}
      </div>
    );
  }

  return (
    <form action={formAction} className='flex flex-wrap items-center gap-2'>
      <Button disabled={pending} size='sm' type='submit' variant={variant}>
        {pending ? 'Saving…' : label}
      </Button>
      {result}
    </form>
  );
}
