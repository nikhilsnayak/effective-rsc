'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.
// oxlint-disable effecttsgo/crypto-random-uuid -- Browser-generated mutation identifiers must not pull Effect into the client graph.

import { Archive, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { RegistrationSettingsMutationState } from '@/modules/registration-settings/server-functions';
import {
  archiveRegistrationQuestion,
  createRegistrationQuestion,
} from '@/modules/registration-settings/server-functions';

function MutationMessage({ state }: { state: RegistrationSettingsMutationState | null }) {
  return state ? (
    <RevealTransition>
      <p
        aria-live='polite'
        className={state.status === 'error' ? 'text-destructive text-xs' : 'text-xs'}
      >
        {state.message}
      </p>
    </RevealTransition>
  ) : null;
}

export function CreateRegistrationQuestion({ eventId }: { readonly eventId: string }) {
  // oxlint-disable-next-line effecttsgo/crypto-random-uuid -- The browser owns the question identifier before invoking the Server Function.
  const [questionId, setQuestionId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RegistrationSettingsMutationState | null>(null);

  return (
    <form
      className='grid gap-5'
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        startTransition(async () => {
          const result = await createRegistrationQuestion(formData);
          startTransition(() => {
            setState(result);
            if (result.status === 'success') {
              form.reset();
              // oxlint-disable-next-line effecttsgo/crypto-random-uuid -- Each new question receives a browser-owned identifier.
              setQuestionId(crypto.randomUUID());
            }
          });
        });
      }}
    >
      <input name='eventId' type='hidden' value={eventId} />
      <input name='questionId' type='hidden' value={questionId} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor='question-label'>Question</FieldLabel>
          <Input id='question-label' maxLength={160} name='label' required />
        </Field>
        <Field>
          <FieldLabel htmlFor='question-description'>Help text</FieldLabel>
          <Textarea id='question-description' maxLength={500} name='description' />
        </Field>
        <div className='grid gap-5 sm:grid-cols-2'>
          <Field>
            <FieldLabel htmlFor='question-type'>Answer type</FieldLabel>
            <NativeSelect className='w-full' id='question-type' name='questionType'>
              <NativeSelectOption value='text'>Free text</NativeSelectOption>
              <NativeSelectOption value='select'>Select one</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor='question-required'>Requirement</FieldLabel>
            <NativeSelect className='w-full' id='question-required' name='required'>
              <NativeSelectOption value='false'>Optional</NativeSelectOption>
              <NativeSelectOption value='true'>Required</NativeSelectOption>
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor='question-options'>Select options</FieldLabel>
          <Textarea
            id='question-options'
            maxLength={1_000}
            name='options'
            placeholder='One option per line; ignored for free-text questions'
          />
          <FieldDescription>Select questions need at least two distinct options.</FieldDescription>
        </Field>
      </FieldGroup>
      <Button disabled={pending} type='submit'>
        <Plus aria-hidden='true' data-icon='inline-start' />
        {pending ? 'Creating…' : 'Add question'}
      </Button>
      <MutationMessage state={state} />
    </form>
  );
}

export function ArchiveRegistrationQuestion({
  eventId,
  questionId,
}: {
  readonly eventId: string;
  readonly questionId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RegistrationSettingsMutationState | null>(null);

  return (
    <form
      className='grid justify-items-end gap-2'
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await archiveRegistrationQuestion(formData);
          startTransition(() => setState(result));
        });
      }}
    >
      <input name='eventId' type='hidden' value={eventId} />
      <input name='questionId' type='hidden' value={questionId} />
      <Button disabled={pending} size='sm' type='submit' variant='outline'>
        <Archive aria-hidden='true' data-icon='inline-start' />
        {pending ? 'Archiving…' : 'Archive'}
      </Button>
      <MutationMessage state={state} />
    </form>
  );
}
