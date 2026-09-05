'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.
// oxlint-disable effecttsgo/crypto-random-uuid -- Browser-generated idempotency keys must not pull Effect into the client graph.

import { Save, Send } from 'lucide-react';
import { startTransition, useActionState, useRef, useState } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { CommunicationsMutationState } from '@/modules/communications/server-functions';
import { saveAnnouncement, sendAnnouncement } from '@/modules/communications/server-functions';

function MutationMessage({ state }: { readonly state: CommunicationsMutationState | null }) {
  return state ? (
    <RevealTransition>
      <p
        aria-live='polite'
        className={
          state.status === 'error' ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'
        }
      >
        {state.message}
      </p>
    </RevealTransition>
  ) : null;
}

export function AnnouncementComposer({ eventId }: { readonly eventId: string }) {
  const [announcementId, setAnnouncementId] = useState(() => crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useActionState<CommunicationsMutationState | null, FormData>(
    async (previousState, form) => {
      const next = await saveAnnouncement(previousState, form);
      if (next.status === 'success') {
        formRef.current?.reset();
        setAnnouncementId(crypto.randomUUID());
      }
      return next;
    },
    null,
  );

  return (
    <form
      className='grid gap-5'
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => submit(formData));
      }}
    >
      <input name='announcementId' type='hidden' value={announcementId} />
      <input name='eventId' type='hidden' value={eventId} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor='announcement-subject'>Subject</FieldLabel>
          <Input id='announcement-subject' maxLength={160} name='subject' required />
        </Field>
        <Field>
          <FieldLabel htmlFor='announcement-audience'>Audience</FieldLabel>
          <NativeSelect
            className='w-full'
            defaultValue='all_attendees'
            id='announcement-audience'
            name='audience'
            required
          >
            <NativeSelectOption value='all_attendees'>All active attendees</NativeSelectOption>
            <NativeSelectOption value='checked_in'>Checked-in attendees</NativeSelectOption>
            <NativeSelectOption value='not_checked_in'>Not yet checked in</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor='announcement-body'>Message</FieldLabel>
          <Textarea
            className='min-h-36'
            id='announcement-body'
            maxLength={4_000}
            name='body'
            required
          />
        </Field>
      </FieldGroup>
      <div className='flex flex-wrap items-center gap-3'>
        <Button disabled={pending} type='submit'>
          <Save aria-hidden='true' data-icon='inline-start' />
          {pending ? 'Saving…' : 'Save draft'}
        </Button>
        <MutationMessage state={state} />
      </div>
    </form>
  );
}

export function SendAnnouncementButton({
  announcementId,
  eventId,
  retry = false,
}: {
  readonly announcementId: string;
  readonly eventId: string;
  readonly retry?: boolean;
}) {
  const [state, formAction, pending] = useActionState(sendAnnouncement, null);

  return (
    <form action={formAction} className='flex flex-wrap items-center gap-3'>
      <input name='announcementId' type='hidden' value={announcementId} />
      <input name='eventId' type='hidden' value={eventId} />
      <Button disabled={pending} size='sm' type='submit'>
        <Send aria-hidden='true' data-icon='inline-start' />
        {pending ? 'Sending…' : retry ? 'Retry pending' : 'Send now'}
      </Button>
      <MutationMessage state={state} />
    </form>
  );
}
