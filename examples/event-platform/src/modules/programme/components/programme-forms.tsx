'use client';

// oxlint-disable effecttsgo/async-function -- React Transition Actions are native Promise boundaries.

import { Eye, EyeOff, Save, Undo2 } from 'lucide-react';
import { type ReactNode, useState, useTransition } from 'react';

import { RevealTransition } from '@/components/navigation-transition';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  ProgrammeEvent,
  ProgrammeRoom,
  ProgrammeSession,
  ProgrammeSpeaker,
} from '@/modules/programme/model';
import type { ProgrammeMutationState } from '@/modules/programme/server-functions';
import {
  saveRoom,
  saveSession,
  saveSpeaker,
  setSessionStatus,
} from '@/modules/programme/server-functions';

function ControlField({ children, id, label }: { children: ReactNode; id: string; label: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </Field>
  );
}

function MutationMessage({ state }: { readonly state: ProgrammeMutationState | null }) {
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

export function RoomForm({
  eventId,
  room,
}: {
  readonly eventId: string;
  readonly room?: ProgrammeRoom;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ProgrammeMutationState | null>(null);
  const prefix = room?.roomId ?? 'new-room';

  return (
    <form
      className='border-border grid gap-4 rounded-xl border p-5'
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await saveRoom(formData);
          startTransition(() => setState(next));
        });
      }}
    >
      <input name='eventId' type='hidden' value={eventId} />
      {room ? <input name='roomId' type='hidden' value={room.roomId} /> : null}
      <h3 className='font-semibold'>{room?.name ?? 'Add a room'}</h3>
      <FieldGroup>
        <ControlField id={`${prefix}-name`} label='Room name'>
          <Input
            defaultValue={room?.name}
            id={`${prefix}-name`}
            maxLength={100}
            name='name'
            required
          />
        </ControlField>
        <ControlField id={`${prefix}-capacity`} label='Capacity'>
          <Input
            defaultValue={room?.capacity ?? 40}
            id={`${prefix}-capacity`}
            min={1}
            name='capacity'
            required
            type='number'
          />
        </ControlField>
      </FieldGroup>
      <div className='flex flex-wrap items-center gap-3'>
        <Button disabled={pending} size='sm' type='submit' variant='outline'>
          <Save aria-hidden='true' data-icon='inline-start' />
          {pending ? 'Saving…' : room ? 'Save room' : 'Add room'}
        </Button>
        <MutationMessage state={state} />
      </div>
    </form>
  );
}

export function SpeakerForm({
  eventId,
  speaker,
}: {
  readonly eventId: string;
  readonly speaker?: ProgrammeSpeaker;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ProgrammeMutationState | null>(null);
  const prefix = speaker?.speakerId ?? 'new-speaker';

  return (
    <form
      className='border-border grid gap-4 rounded-xl border p-5'
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const next = await saveSpeaker(formData);
          startTransition(() => setState(next));
        });
      }}
    >
      <input name='eventId' type='hidden' value={eventId} />
      {speaker ? <input name='speakerId' type='hidden' value={speaker.speakerId} /> : null}
      <h3 className='font-semibold'>{speaker?.name ?? 'Add a speaker'}</h3>
      <FieldGroup>
        <ControlField id={`${prefix}-name`} label='Name'>
          <Input
            defaultValue={speaker?.name}
            id={`${prefix}-name`}
            maxLength={120}
            name='name'
            required
          />
        </ControlField>
        <div className='grid gap-4 sm:grid-cols-2'>
          <ControlField id={`${prefix}-role`} label='Role'>
            <Input
              defaultValue={speaker?.role}
              id={`${prefix}-role`}
              maxLength={120}
              name='role'
              required
            />
          </ControlField>
          <ControlField id={`${prefix}-organization`} label='Organization'>
            <Input
              defaultValue={speaker?.organization}
              id={`${prefix}-organization`}
              maxLength={120}
              name='organization'
              required
            />
          </ControlField>
        </div>
        <ControlField id={`${prefix}-bio`} label='Bio'>
          <Textarea
            className='min-h-24'
            defaultValue={speaker?.bio}
            id={`${prefix}-bio`}
            maxLength={1_500}
            name='bio'
            required
          />
        </ControlField>
      </FieldGroup>
      <div className='flex flex-wrap items-center gap-3'>
        <Button disabled={pending} size='sm' type='submit' variant='outline'>
          <Save aria-hidden='true' data-icon='inline-start' />
          {pending ? 'Saving…' : speaker ? 'Save speaker' : 'Add speaker'}
        </Button>
        <MutationMessage state={state} />
      </div>
    </form>
  );
}

export function SessionForm({
  event,
  rooms,
  session,
  speakers,
}: {
  readonly event: ProgrammeEvent;
  readonly rooms: ReadonlyArray<ProgrammeRoom>;
  readonly session?: ProgrammeSession;
  readonly speakers: ReadonlyArray<ProgrammeSpeaker>;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ProgrammeMutationState | null>(null);
  const prefix = session?.sessionId ?? 'new-session';
  const canCreate = rooms.length > 0 && speakers.length > 0;
  const [capacity, setCapacity] = useState(() =>
    String(session?.capacity ?? Math.min(event.capacity, rooms[0]?.capacity ?? 40)),
  );

  return (
    <form
      className='border-border grid gap-4 rounded-xl border p-5'
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        const formData = new FormData(submitEvent.currentTarget);
        startTransition(async () => {
          const next = await saveSession(formData);
          startTransition(() => setState(next));
        });
      }}
    >
      <input name='eventId' type='hidden' value={event.eventId} />
      {session ? <input name='sessionId' type='hidden' value={session.sessionId} /> : null}
      <h3 className='font-semibold'>{session?.title ?? 'Add a session'}</h3>
      <FieldGroup>
        <ControlField id={`${prefix}-title`} label='Title'>
          <Input
            defaultValue={session?.title}
            disabled={!canCreate}
            id={`${prefix}-title`}
            maxLength={160}
            name='title'
            required
          />
        </ControlField>
        <ControlField id={`${prefix}-summary`} label='Summary'>
          <Textarea
            className='min-h-24'
            defaultValue={session?.summary}
            disabled={!canCreate}
            id={`${prefix}-summary`}
            maxLength={1_000}
            name='summary'
            required
          />
        </ControlField>
        <div className='grid gap-4 sm:grid-cols-2'>
          <ControlField id={`${prefix}-room`} label='Room'>
            <NativeSelect
              className='w-full'
              defaultValue={session?.roomId}
              disabled={!canCreate}
              id={`${prefix}-room`}
              name='roomId'
              required
            >
              <NativeSelectOption value=''>Choose a room</NativeSelectOption>
              {rooms.map((room) => (
                <NativeSelectOption key={room.roomId} value={room.roomId}>
                  {room.name} · {room.capacity}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </ControlField>
          <ControlField id={`${prefix}-speaker`} label='Speaker'>
            <NativeSelect
              className='w-full'
              defaultValue={session?.speakerId}
              disabled={!canCreate}
              id={`${prefix}-speaker`}
              name='speakerId'
              required
            >
              <NativeSelectOption value=''>Choose a speaker</NativeSelectOption>
              {speakers.map((speaker) => (
                <NativeSelectOption key={speaker.speakerId} value={speaker.speakerId}>
                  {speaker.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </ControlField>
        </div>
        <div className='grid gap-4 sm:grid-cols-3'>
          <ControlField id={`${prefix}-starts`} label='Starts'>
            <Input
              defaultValue={session?.startsAt}
              disabled={!canCreate}
              id={`${prefix}-starts`}
              name='startsAt'
              required
              type='datetime-local'
            />
          </ControlField>
          <ControlField id={`${prefix}-ends`} label='Ends'>
            <Input
              defaultValue={session?.endsAt}
              disabled={!canCreate}
              id={`${prefix}-ends`}
              name='endsAt'
              required
              type='datetime-local'
            />
          </ControlField>
          <ControlField id={`${prefix}-capacity`} label='Capacity'>
            <Input
              disabled={!canCreate}
              id={`${prefix}-capacity`}
              min={1}
              name='capacity'
              onChange={(changeEvent) => setCapacity(changeEvent.currentTarget.value)}
              required
              type='number'
              value={capacity}
            />
          </ControlField>
        </div>
      </FieldGroup>
      {!canCreate ? (
        <p className='text-muted-foreground text-sm'>Add at least one room and speaker first.</p>
      ) : null}
      <div className='flex flex-wrap items-center gap-3'>
        <Button disabled={pending || !canCreate} size='sm' type='submit' variant='outline'>
          <Save aria-hidden='true' data-icon='inline-start' />
          {pending ? 'Saving…' : session ? 'Save session' : 'Add draft session'}
        </Button>
        {session ? (
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const next = await setSessionStatus({
                  eventId: event.eventId,
                  sessionId: session.sessionId,
                  status: session.status === 'published' ? 'draft' : 'published',
                });
                startTransition(() => setState(next));
              });
            }}
            size='sm'
            type='button'
            variant='ghost'
          >
            {session.status === 'published' ? (
              <EyeOff aria-hidden='true' data-icon='inline-start' />
            ) : (
              <Eye aria-hidden='true' data-icon='inline-start' />
            )}
            {session.status === 'published' ? 'Move to draft' : 'Publish session'}
          </Button>
        ) : null}
        {session && session.status !== 'cancelled' ? (
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const next = await setSessionStatus({
                  eventId: event.eventId,
                  sessionId: session.sessionId,
                  status: 'cancelled',
                });
                startTransition(() => setState(next));
              });
            }}
            size='sm'
            type='button'
            variant='ghost'
          >
            <Undo2 aria-hidden='true' data-icon='inline-start' />
            Cancel session
          </Button>
        ) : null}
        <MutationMessage state={state} />
      </div>
    </form>
  );
}
